// Calidad operativa: the same overview counts the page already shows, drawn as severity donut, rule bars and the
// GRH–PERSONAS crosswalk. No extra request and no personal data. Touching a slice or bar applies that filter.
import {chartSlot, drawChart} from './mc-chart-loader.js';

const SEVERITY = [['critical', 'Crítica', '#9f2a1d'], ['error', 'Error', '#c2604f'], ['warning', 'Advertencia', '#d08c2f'], ['info', 'Información', '#315f82']];
let slots = null;

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const count = value => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0; };
const dataOf = raw => { const envelope = object(raw); return object(envelope.data || object(envelope.payload).data || envelope); };

function ensureSlots() {
 const summary = document.getElementById('summaryPanel'); const grid = summary?.querySelector('.kpi-grid'); if (!grid) return null;
 if (slots?.row.isConnected) return slots;
 const row = document.createElement('div'); row.className = 'mc-chart-row'; row.dataset.qualityCharts = 'true';
 const severity = chartSlot('Por severidad', {subtitle: 'Tocá un tramo para filtrar la bandeja', key: 'quality-severity'});
 const rules = chartSlot('Reglas con más incidencias', {subtitle: 'Tocá una regla para filtrar la bandeja', key: 'quality-rules'});
 const crosswalk = chartSlot('Identidad GRH–PERSONAS', {subtitle: 'Registros activos del crosswalk', key: 'quality-crosswalk'});
 row.append(severity.figure, rules.figure, crosswalk.figure); grid.after(row);
 slots = {row, severity, rules, crosswalk}; return slots;
}

function applyFilter(selectId, value) {
 const select = document.getElementById(selectId), form = document.getElementById('filterForm');
 if (!select || !form || ![...select.options].some(o => o.value === value)) return;
 select.value = value; select.dispatchEvent(new Event('change', {bubbles: true}));
 if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.dispatchEvent(new Event('submit', {cancelable: true}));
}

function codeLabel(code) {
 const option = [...(document.getElementById('codeSelect')?.options || [])].find(o => o.value === code);
 return option?.textContent?.trim() || code;
}

function render(state) {
 if (!state || typeof document === 'undefined') return;
 const s = ensureSlots(); if (!s) return;
 const data = dataOf(state.raw), issues = object(data.issues), bySeverity = object(issues.bySeverity);
 const severityItems = SEVERITY.map(([key, label, color]) => ({key, name: label, value: count(bySeverity[key]), itemStyle: {color}})).filter(i => i.value > 0);
 const codes = (Array.isArray(object(data.breakdowns).codes) ? data.breakdowns.codes : [])
  .map(row => ({code: String(object(row).code || ''), value: count(object(row).issues)})).filter(r => r.code && r.value > 0)
  .reduce((acc, r) => { const hit = acc.find(a => a.code === r.code); if (hit) hit.value += r.value; else acc.push({...r}); return acc; }, [])
  .sort((a, b) => b.value - a.value).slice(0, 8);
 const cw = object(state.overview?.crosswalk);
 const crosswalkItems = [['Vinculados', cw.matched, '#0f766e'], ['Ambiguos', cw.ambiguous, '#d08c2f'], ['Sin coincidencia', cw.unmatched, '#c2604f'], ['Rechazados', cw.rejected, '#6b5ca5']]
  .map(([name, value, color]) => ({name, value: count(value), itemStyle: {color}})).filter(i => i.value > 0);
 s.severity.figure.hidden = !severityItems.length; s.rules.figure.hidden = !codes.length; s.crosswalk.figure.hidden = !crosswalkItems.length;
 s.row.hidden = !severityItems.length && !codes.length && !crosswalkItems.length; if (s.row.hidden) return;
 if (severityItems.length) drawChart(s.severity.host, m => m.donutOption({items: severityItems, totalLabel: 'Incidencias', format: m.formatNumber}), {
  ariaLabel: 'Incidencias por severidad', onClick: e => { const item = severityItems[e.dataIndex]; if (item) applyFilter('severitySelect', item.key); }
 });
 if (codes.length) drawChart(s.rules.host, m => m.barOption({categories: codes.map(c => { const l = codeLabel(c.code); return l.length > 30 ? l.slice(0, 29) + '…' : l; }), values: codes.map(c => c.value), horizontal: true, name: 'Incidencias'}), {
  ariaLabel: 'Incidencias por regla de control', onClick: e => { const item = codes[e.dataIndex]; if (item) applyFilter('codeSelect', item.code); }
 });
 if (crosswalkItems.length) drawChart(s.crosswalk.host, m => m.donutOption({items: crosswalkItems, totalLabel: 'Registros', format: m.formatNumber}), {ariaLabel: 'Vínculos del crosswalk GRH–PERSONAS'});
}

function clear() { if (slots?.row) slots.row.hidden = true; }
window.MuniControlQualityCharts = Object.freeze({render, clear});
if (window.__mcQuality) render(window.__mcQuality);
