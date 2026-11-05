// Ausentismo: ECharts views of the same aggregated analytics the page already renders (monthly series, reasons, sectors).
// No extra request and no personal data. The accessible tables stay; the old CSS bars hide only after a chart is drawn.
import {chartSlot, drawChart, loadCharts} from './mc-chart-loader.js';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const monthLabel = value => { const m = /^(\d{4})-(\d{2})/.exec(String(value || '')); return m ? MONTHS[Number(m[2]) - 1] + ' ' + m[1].slice(2) : String(value || ''); };
let slots = null;

function ensureSlots() {
 const series = document.getElementById('monthlySeries'); const section = series?.closest('section'); if (!section) return null;
 if (slots?.row.isConnected) return slots;
 const row = document.createElement('div'); row.className = 'mc-chart-row'; row.dataset.absenceCharts = 'true';
 const trend = chartSlot('Evolución mensual', {subtitle: 'Eventos administrativos por mes · * mes parcial', size: 'lg', key: 'absence-trend'});
 const calendar = chartSlot('Mapa de calor diario', {subtitle: 'Eventos por día con los mismos filtros · más oscuro = más eventos', size: 'lg', key: 'absence-calendar'});
 calendar.figure.style.gridColumn = '1 / -1';
 const reasons = chartSlot('Motivos', {subtitle: 'Distribución de eventos del período', key: 'absence-reasons'});
 const sectors = chartSlot('Sectores con más eventos', {subtitle: 'Los diez primeros', key: 'absence-sectors'});
 trend.figure.style.gridColumn = '1 / -1';
 row.append(trend.figure, calendar.figure, reasons.figure, sectors.figure);
 const anchor = series.closest('.series-scroll') || series; anchor.parentElement.insertBefore(row, anchor);
 slots = {row, trend, calendar, reasons, sectors, legacy: anchor}; return slots;
}

function topWithOthers(items, limit) {
 const sorted = [...items].filter(i => (i.count || 0) > 0).sort((a, b) => (b.count || 0) - (a.count || 0));
 const head = sorted.slice(0, limit), rest = sorted.slice(limit).reduce((s, i) => s + (i.count || 0), 0);
 return rest > 0 ? [...head, {label: 'Otros', count: rest}] : head;
}

async function render(analytics) {
 if (!analytics || typeof document === 'undefined') return;
 const s = ensureSlots(); if (!s) return;
 const monthly = Array.isArray(analytics.monthly) ? analytics.monthly : [], reasons = Array.isArray(analytics.reasons) ? analytics.reasons : [], sectors = Array.isArray(analytics.sectors) ? analytics.sectors : [];
 const empty = !monthly.length || !(analytics.summary?.events > 0);
 s.row.hidden = empty; s.legacy.hidden = false; if (empty) return;
 const drawn = await drawChart(s.trend.host, m => {
  const option = m.trendOption({points: monthly.map(i => [monthLabel(i.month) + (i.partial ? ' *' : ''), i.events || 0]), name: 'Eventos'});
  option.series.push({type: 'bar', name: 'Legajos con eventos', data: monthly.map(i => i.contracts || 0), barMaxWidth: 18, itemStyle: {borderRadius: [5, 5, 0, 0], color: 'rgba(49,95,130,.35)'}, z: 1});
  option.xAxis.boundaryGap = true; option.yAxis.scale = false;
  option.legend = {top: 0, right: 0}; option.tooltip = {trigger: 'axis', valueFormatter: v => m.formatNumber(v)};
  return option;
 }, {ariaLabel: 'Eventos y legajos con eventos por mes'});
 if (drawn) s.legacy.hidden = true;
 drawDaily(s, monthly);
 const reasonItems = topWithOthers(reasons, 7);
 s.reasons.figure.hidden = !reasonItems.length;
 if (reasonItems.length) drawChart(s.reasons.host, m => m.donutOption({items: reasonItems.map(i => ({name: i.label, value: i.count || 0})), totalLabel: 'Eventos', format: m.formatNumber}), {ariaLabel: 'Eventos por motivo'});
 const sectorItems = [...sectors].filter(i => (i.count || 0) > 0).sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 10);
 s.sectors.figure.hidden = !sectorItems.length;
 if (sectorItems.length) drawChart(s.sectors.host, m => m.barOption({categories: sectorItems.map(i => i.label.length > 28 ? i.label.slice(0, 27) + '…' : i.label), values: sectorItems.map(i => i.count || 0), horizontal: true, name: 'Eventos'}), {ariaLabel: 'Eventos por sector'});
}

let dailyToken = 0;
async function drawDaily(s, monthly = []) {
 const token = ++dailyToken, query = window.__mcAbsenceQuery; s.calendar.figure.hidden = !query; if (!query) return;
 try {
  const url = new URL(query, location.origin); url.searchParams.set('bucket', 'day');
  // At most twelve months of days: from the first day of the eleventh month before the last month in the series.
  const lastMonth = /^(\d{4})-(\d{2})/.exec(String(monthly.at(-1)?.month || ''));
  if (lastMonth) {
   const first = new Date(Date.UTC(Number(lastMonth[1]), Number(lastMonth[2]) - 12, 1)).toISOString().slice(0, 10);
   if (!(url.searchParams.get('from') > first)) url.searchParams.set('from', first);
  }
  const response = await fetch(url.pathname + url.search, {credentials: 'same-origin', cache: 'no-store', headers: {Accept: 'application/json'}});
  const payload = response.ok ? await response.json() : null; if (token !== dailyToken) return;
  const series = Array.isArray(payload?.data?.series) ? payload.data.series : [];
  const days = series.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(String(r.period || '').slice(0, 10))).map(r => [String(r.period).slice(0, 10), Number(r.events) || 0]);
  s.calendar.figure.hidden = !days.length; if (!days.length) return;
  const sorted = days.map(d => d[0]).sort(), last = sorted.at(-1), start = new Date(last + 'T12:00:00'); start.setDate(start.getDate() - 364);
  const from = sorted[0] > start.toISOString().slice(0, 10) ? sorted[0] : start.toISOString().slice(0, 10);
  const shown = days.filter(d => d[0] >= from).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  const mounted = await drawChart(s.calendar.host, m => m.calendarHeatmapOption({days: shown, range: [from, last], label: 'eventos'}), {ariaLabel: 'Eventos de ausentismo por día'});
  if (mounted && token === dailyToken) (await loadCharts()).revealSeries?.(mounted.chart, shown);
 } catch { if (token === dailyToken) s.calendar.figure.hidden = true; }
}

function clear() { if (slots?.row) { slots.row.hidden = true; slots.legacy.hidden = false; } }
window.MuniControlAbsenceCharts = Object.freeze({render, clear});
if (window.__mcLastAbsence) render(window.__mcLastAbsence);
