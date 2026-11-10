// Estructura: the same grouped structure payload the explorer already renders (no extra request, no individual rows),
// drawn as active/inactive split, organizations by legajos and a sector treemap. Touching a bar or tile searches it.
import {chartSlot, drawChart} from './mc-chart-loader.js';

let slots = null;
const count = value => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0; };
const short = (label, max = 30) => label.length > max ? label.slice(0, max - 1) + '…' : label;

function ensureSlots() {
 const metrics = document.querySelector('section.metrics[aria-label="Cobertura de estructura"]'); if (!metrics) return null;
 if (slots?.row.isConnected) return slots;
 const row = document.createElement('div'); row.className = 'mc-chart-row'; row.dataset.structureCharts = 'true';
 const status = chartSlot('Legajos activos e inactivos', {subtitle: 'Según la situación que informa GRH para cada legajo', size: 'lg', key: 'structure-status'});
 const organizations = chartSlot('Organizaciones con más legajos activos', {subtitle: 'Las doce primeras · tocá una para buscarla', size: 'lg', key: 'structure-organizations'});
 const sectors = chartSlot('Sectores por legajos activos', {subtitle: 'Tocá un sector para buscarlo', size: 'lg', key: 'structure-sectors'});
 row.append(status.figure, organizations.figure, sectors.figure); metrics.after(row);
 slots = {row, status, organizations, sectors}; return slots;
}

function search(view, label) {
 const tab = document.querySelector(`.tab[data-view="${view}"]`), input = document.getElementById('searchInput');
 if (!tab || !input || !label) return;
 if (tab.getAttribute('aria-selected') !== 'true') tab.click();
 input.value = label; input.dispatchEvent(new Event('input', {bubbles: true}));
 // El explorador vive en otra pestaña de la pantalla: tocar un gráfico la trae al frente antes de buscar.
 const panel = document.getElementById('panel-' + view); if (panel) globalThis.mcSectionTabsReveal?.(panel);
 panel?.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
}

function render(payload) {
 if (!payload || typeof document === 'undefined') return;
 const s = ensureSlots(); if (!s) return;
 const coverage = payload.coverage || {};
 const statusItems = [['Activos', coverage.activeRecords, '#0f766e'], ['Inactivos', coverage.inactiveRecords, '#9fb3bd']]
  .map(([name, value, color]) => ({name, value: count(value), itemStyle: {color}})).filter(i => i.value > 0);
 const assigned = rows => (Array.isArray(rows) ? rows : []).filter(r => r && r.assigned === true && typeof r.label === 'string' && r.label.trim());
 const organizations = assigned(payload.organizations).filter(r => count(r.active) > 0).sort((a, b) => count(b.active) - count(a.active)).slice(0, 12);
 const sectors = assigned(payload.sectors).filter(r => count(r.active) > 0).sort((a, b) => count(b.active) - count(a.active)).slice(0, 20);
 s.status.figure.hidden = !statusItems.length; s.organizations.figure.hidden = !organizations.length; s.sectors.figure.hidden = !sectors.length;
 s.row.hidden = !statusItems.length && !organizations.length && !sectors.length; if (s.row.hidden) return;
 if (statusItems.length) drawChart(s.status.host, m => m.donutOption({items: statusItems, totalLabel: 'Legajos', format: m.formatNumber}), {ariaLabel: 'Legajos activos e inactivos'});
 if (organizations.length) drawChart(s.organizations.host, m => {
  const option = m.barOption({categories: organizations.map(r => short(r.label)), values: organizations.map(r => count(r.active)), horizontal: true, name: 'Activos', color: '#0f766e'});
  Object.assign(option.series[0], {stack: 'legajos', label: {show: false}}); option.series[0].itemStyle.borderRadius = 0;
  option.series.push({type: 'bar', name: 'Inactivos', stack: 'legajos', data: organizations.map(r => count(r.inactive)), barMaxWidth: 34,
   itemStyle: {color: 'rgba(49,95,130,.28)', borderRadius: [0, 6, 6, 0]}, emphasis: {focus: 'series'}, animationDelay: i => 200 + i * 45});
  option.legend = {top: 0, right: 0};
  return option;
 }, {ariaLabel: 'Legajos activos e inactivos por organización', onClick: p => search('organizations', organizations[p.dataIndex]?.label)});
 if (sectors.length) drawChart(s.sectors.host, m => m.treemapOption({nodes: sectors.map(r => ({name: r.label, value: count(r.active)}))}), {
  ariaLabel: 'Legajos activos por sector', onClick: p => search('sectors', p.name)
 });
}

function clear() { if (slots?.row) slots.row.hidden = true; }
window.MuniControlStructureCharts = Object.freeze({render, clear});
if (window.__mcStructure) render(window.__mcStructure);
