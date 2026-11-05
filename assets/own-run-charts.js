// Calcular: visual summary of the saved run that is already on screen (no extra request). Amounts come from the verified
// result's per-legajo totals; the exact figures stay in the table and the CSV, the charts show proportions and spread.
import {chartSlot, drawChart} from './mc-chart-loader.js';

const decimal = value => { const n = Number(value); return Number.isFinite(n) ? n : 0; };

function niceStep(span, bins) {
 const raw = span / bins, power = 10 ** Math.floor(Math.log10(raw || 1)), unit = raw / power;
 return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10) * power;
}

/** Legajos per net range: at most ten ranges with round limits. */
export function netHistogram(nets) {
 const values = nets.filter(n => Number.isFinite(n));
 if (!values.length) return [];
 const min = Math.min(...values), max = Math.max(...values);
 if (min === max) return [{from: min, to: max, count: values.length}];
 const step = niceStep(max - min, 8), start = Math.floor(min / step) * step, bins = [];
 for (let from = start; from <= max; from += step) bins.push({from, to: from + step, count: 0});
 for (const v of values) bins[Math.min(bins.length - 1, Math.floor((v - start) / step))].count++;
 return bins;
}

const STATE_COLORS = {calculated: '#d08c2f', confirmed: '#0f766e', annulled: '#c2604f', cancelled: '#9fb3bd'};

/** states (optional): [{key, name, value}] for the review of decisions; anchor defaults to the totals table of Calcular. */
export function drawRunCharts(section, result, {anchor = section?.querySelector('.own-run-scroll'), states = null} = {}) {
 if (!section || !anchor || typeof document === 'undefined') return;
 let row = section.querySelector('[data-own-run-charts]');
 if (!row) {
  row = document.createElement('div'); row.className = 'mc-chart-row'; row.dataset.ownRunCharts = 'true';
  const status = states ? chartSlot('Estado de los legajos', {subtitle: 'Decisiones registradas sobre esta corrida', key: 'own-run-states'}) : null;
  const composition = chartSlot('Composición del bruto', {subtitle: 'Neto y retenciones de la corrida guardada', key: 'own-run-composition'});
  const spread = chartSlot('Distribución del neto', {subtitle: 'Legajos por rango de neto calculado', key: 'own-run-spread'});
  row.append(...[status?.figure, composition.figure, spread.figure].filter(Boolean)); anchor.before(row); row.__slots = {status, composition, spread};
 }
 const stateItems = (Array.isArray(states) ? states : []).filter(i => i && i.value > 0).map(i => ({name: i.name, value: i.value, itemStyle: {color: STATE_COLORS[i.key] || '#315f82'}}));
 if (row.__slots.status) {
  row.__slots.status.figure.hidden = !stateItems.length;
  if (stateItems.length) drawChart(row.__slots.status.host, m => m.donutOption({items: stateItems, totalLabel: 'Legajos', format: m.formatNumber}), {ariaLabel: 'Legajos por estado de decisión'});
 }
 const totals = Array.isArray(result?.employeeTotals) ? result.employeeTotals : [];
 const sum = key => totals.reduce((s, t) => s + decimal(t?.[key]), 0);
 const net = sum('net'), deduction = sum('deduction'), employer = sum('employer_contribution');
 row.hidden = !totals.length || !(net > 0); if (row.hidden) return;
 const {composition, spread} = row.__slots;
 drawChart(composition.host, m => {
  const option = m.donutOption({items: [{name: 'Neto', value: net, itemStyle: {color: '#0f766e'}}, {name: 'Retenciones', value: deduction, itemStyle: {color: '#d08c2f'}}].filter(i => i.value > 0), totalLabel: 'Bruto', format: m.formatCompactMoney});
  const note = composition.figure.querySelector('figcaption span');
  if (note) note.textContent = 'Neto y retenciones de la corrida guardada' + (employer > 0 ? ' · aportes patronales ' + m.formatCompactMoney(employer) : '');
  return option;
 }, {ariaLabel: 'Composición del bruto de la corrida: neto y retenciones'});
 const bins = netHistogram(totals.map(t => decimal(t?.net)));
 drawChart(spread.host, m => {
  // Range limits keep two decimals in millions so 1,25 M is not shown as 1,3 M.
  const limit = v => v >= 1e6 ? '$ ' + (v / 1e6).toLocaleString('es-AR', {maximumFractionDigits: 2}) + ' M' : v >= 1e3 ? '$ ' + Math.round(v / 1e3).toLocaleString('es-AR') + ' k' : '$ ' + v.toLocaleString('es-AR', {maximumFractionDigits: 2});
  const label = b => limit(b.from) + '–' + limit(b.to);
  const option = m.barOption({categories: bins.map(label), values: bins.map(b => b.count), name: 'Legajos', color: '#315f82'});
  option.xAxis.axisLabel = {interval: 0, rotate: bins.length > 5 ? 30 : 0, fontSize: 10};
  option.tooltip = {trigger: 'axis', axisPointer: {type: 'shadow'}, formatter: p => `<b>${p[0].name}</b><br>${m.formatNumber(p[0].value)} legajos`};
  return option;
 }, {ariaLabel: 'Cantidad de legajos por rango de neto calculado'});
}
