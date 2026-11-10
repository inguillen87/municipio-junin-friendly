// Ausentismo: tablero visual en lenguaje simple sobre los mismos datos agregados de la página.
// - Conclusiones en una línea («El mes con más licencias fue…») para quien no es técnico.
// - Gráficos sin superposiciones (barras horizontales con etiquetas completas en lugar de una torta con leyenda encima).
// - Mapa de calor explicado y resumen por día de la semana.
// - Personas con más licencias (recurso nominal propio; se borra al salir o cambiar de filtros).
// - Cada gráfico se amplía con un clic y todo se descarga en un PDF con gráficos.
// Las tablas accesibles y los rankings originales siguen en la página; nada se proyecta ni se convierte en tasa.
import {chartSlot, drawChart, loadCharts, closeChartZoom} from './mc-chart-loader.js';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const nf = new Intl.NumberFormat('es-AR', {maximumFractionDigits: 0});
const pf = new Intl.NumberFormat('es-AR', {maximumFractionDigits: 1});
const fmt = v => nf.format(Number(v) || 0);
// Días declarados: se conserva la precisión informada por GRH (hasta dos decimales), sin redondear a enteros.
const df = new Intl.NumberFormat('es-AR', {maximumFractionDigits: 2});
const days = v => df.format(Number(v) || 0);
/** Días de una persona con su cobertura: «Sin informar» si ningún evento trae días; aclara cuando sólo algunos los traen. */
export function personDays(row) {
 const events = Number(row?.events) || 0, reported = row?.reportedDaysEvents;
 if (reported === 0) return 'Sin informar';
 const text = days(row?.sourceDeclaredDays);
 return Number.isInteger(reported) && reported < events ? text + ' (en ' + fmt(reported) + ' de ' + fmt(events) + ')' : text;
}
const pct = (part, total) => total > 0 ? pf.format(part / total * 100) + ' %' : '—';
const monthParts = value => { const m = /^(\d{4})-(\d{2})/.exec(String(value || '')); return m ? {y: Number(m[1]), m: Number(m[2])} : null; };
const monthLabel = value => { const p = monthParts(value); return p ? MONTHS[p.m - 1] + ' ' + String(p.y).slice(2) : String(value || ''); };
const monthLong = value => { const p = monthParts(value); return p ? MONTHS_LONG[p.m - 1] + ' ' + p.y : String(value || ''); };
const isoDay = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
const longDate = iso => iso ? new Intl.DateTimeFormat('es-AR', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(iso + 'T00:00:00Z')) : '';
const shortDate = iso => iso ? new Intl.DateTimeFormat('es-AR', {day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'}).format(new Date(iso + 'T00:00:00Z')) : 'No informada';
// «LICENCIA ANUAL ORDINARIA C/RIESGO» → «Licencia anual ordinaria c/riesgo» (sólo para leer; el tooltip conserva el original).
export function readableLabel(label) {
 const raw = String(label || '').trim(); if (!raw || raw !== raw.toUpperCase()) return raw;
 const lower = raw.toLowerCase(); return lower.charAt(0).toUpperCase() + lower.slice(1);
}
const short = (label, max = 34) => { const t = readableLabel(label); return t.length > max ? t.slice(0, max - 1) + '…' : t; };
const el = (tag, props = {}, ...children) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'role' || k === 'type' || k === 'title') n.setAttribute(k, v); else n[k] = v; } n.append(...children.filter(Boolean)); return n; };

// ---------- Modelo (puro, testeable) ----------
export function topWithOthers(items, limit) {
 const sorted = [...items].filter(i => (i.count || 0) > 0).sort((a, b) => (b.count || 0) - (a.count || 0));
 const head = sorted.slice(0, limit), rest = sorted.slice(limit).reduce((s, i) => s + (i.count || 0), 0);
 return rest > 0 ? [...head, {label: 'Otros motivos', count: rest, others: true}] : head;
}
/** days: [['YYYY-MM-DD', n]] → [{day:'Lunes', count}] de lunes a domingo, por fecha de inicio. */
export function weekdayTotals(days) {
 const totals = WEEKDAYS.map(day => ({day, count: 0}));
 for (const [date, value] of days || []) { const d = new Date(String(date) + 'T12:00:00Z'); if (!Number.isFinite(d.getTime())) continue; totals[(d.getUTCDay() + 6) % 7].count += Number(value) || 0; }
 return totals;
}
/** Frases simples para el encabezado del tablero. */
export function absenceInsights({analytics, days = null} = {}) {
 const out = [], a = analytics || {}, total = a.summary?.events || 0;
 if (!total) return out;
 const monthly = (a.monthly || []).filter(m => (m.events || 0) > 0);
 if (monthly.length > 1) {
  const top = monthly.reduce((b, m) => (m.events > b.events ? m : b));
  out.push({key: 'month', tone: 'teal', label: 'Mes con más licencias', value: monthLong(top.month), detail: fmt(top.events) + ' eventos' + (top.partial ? ' (mes incompleto)' : '')});
 }
 const reasons = [...(a.reasons || [])].sort((x, y) => (y.count || 0) - (x.count || 0));
 if (reasons[0]?.count) out.push({key: 'reason', tone: 'blue', label: 'Motivo más frecuente', value: readableLabel(reasons[0].label), detail: fmt(reasons[0].count) + ' eventos · ' + pct(reasons[0].count, total) + ' del total'});
 const sectors = [...(a.sectors || [])].sort((x, y) => (y.count || 0) - (x.count || 0));
 if (sectors[0]?.count) out.push({key: 'sector', tone: 'amber', label: 'Sector con más eventos', value: readableLabel(sectors[0].label), detail: fmt(sectors[0].count) + ' eventos · ' + pct(sectors[0].count, total) + ' del total'});
 if (days?.length) {
  const week = weekdayTotals(days), sum = week.reduce((s, d) => s + d.count, 0), topDay = week.reduce((b, d) => (d.count > b.count ? d : b));
  if (sum > 0) out.push({key: 'weekday', tone: 'plum', label: 'Día en que más licencias empiezan', value: topDay.day, detail: pct(topDay.count, sum) + ' de los inicios del período del mapa'});
 }
 const change = a.comparison?.available ? a.comparison?.events?.change ?? a.comparison?.change?.events : null;
 if (Number.isFinite(change)) out.push({key: 'comparison', tone: change > 0 ? 'red' : 'teal', label: 'Comparado con el mismo período del año anterior', value: (change > 0 ? '+' : '') + pf.format(change) + ' %', detail: change > 0 ? 'más eventos registrados' : change < 0 ? 'menos eventos registrados' : 'misma cantidad de eventos'});
 return out;
}

// ---------- Estado de la vista ----------
let ui = null, last = null, dayData = null, people = null, peopleSnapshot = null, peopleOrder = 'events', peopleToken = 0, dailyToken = 0;
const slotSpecs = {};

function ensureLayout() {
 const section = document.getElementById('trendPanel'), grid = section?.querySelector('.analysis-grid'); if (!grid) return null;
 if (ui?.root.isConnected) return ui;
 const root = el('div', {class: 'ab-dash', 'data-absence-charts': 'true'});
 const toolbar = el('div', {class: 'ab-toolbar'},
  el('p', {class: 'ab-toolbar-copy', text: 'Tocá «Ampliar» en cualquier gráfico para verlo grande, con sus números, y descargarlo como imagen. Tocá una barra de motivo o sector para filtrar por ella.'}),
  el('button', {type: 'button', class: 'button primary ab-pdf', text: 'Descargar informe en PDF', 'data-absence-pdf': 'true'}));
 const insights = el('ul', {class: 'ab-insights', 'aria-label': 'Conclusiones principales', role: 'list'});
 const cards = el('div', {class: 'ab-grid'});
 const make = (key, title, subtitle, wide = false) => { const slot = chartSlot(title, {subtitle, size: wide ? 'lg' : 'md', key}); slot.figure.classList.add('ab-card'); if (wide) slot.figure.classList.add('ab-wide'); slot.figure.__mcRows = () => slotSpecs[key]?.rows?.() ?? null; cards.append(slot.figure); return slot; };
 const trend = make('absence-trend', 'Licencias por mes', 'Cantidad de eventos y de personas por mes · * mes todavía incompleto', true);
 const reasons = make('absence-reasons', 'Motivos más frecuentes', 'Cuántas licencias hubo por cada motivo');
 const sectors = make('absence-sectors', 'Sectores con más eventos', 'Los diez sectores con más licencias');
 const calendar = make('absence-calendar', 'Mapa de calor: en qué días empiezan las licencias', 'Cada cuadrito es un día · más oscuro = más licencias ese día', true);
 const help = el('div', {class: 'ab-help'},
  el('strong', {text: 'Cómo leerlo'}),
  el('p', {text: 'Las columnas son las semanas del año y las filas los días (L = lunes … D = domingo). Un cuadrito claro casi no tuvo licencias; uno oscuro tuvo muchas. Pasá el mouse o tocá un cuadrito para ver la fecha exacta y la cantidad.'}),
  el('p', {class: 'ab-help-peak', 'data-absence-peak': 'true'}));
 calendar.figure.append(help);
 const weekday = make('absence-weekday', 'Licencias según el día de la semana', 'Suma de inicios de licencia de cada día, mismo período que el mapa');
 const daysByMonth = make('absence-days', 'Días declarados por mes', 'Suma de días informados en GRH (no son jornadas perdidas)');
 root.append(toolbar, insights, cards);
 section.insertBefore(root, grid);
 toolbar.querySelector('[data-absence-pdf]').addEventListener('click', downloadPdf);
 ui = {root, grid, insights, trend, reasons, sectors, calendar, weekday, daysByMonth, help}; return ui;
}

// ---------- Filtros desde los gráficos y atajos de período ----------
function applyFilter(selectId, label) {
 const select = document.getElementById(selectId), form = document.getElementById('filterPanel'); if (!select || !form) return;
 const option = [...select.options].find(o => o.value && (o.textContent.trim() === String(label).trim() || o.value === label)); if (!option) return;
 select.value = option.value; form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', {cancelable: true}));
 document.getElementById('summaryMetrics')?.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
}
const addMonths = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
export function quickRange(kind, cutoff) {
 const end = isoDay(cutoff); if (!end) return null; const y = Number(end.slice(0, 4));
 if (kind === 'month') return {from: end.slice(0, 8) + '01', to: end};
 if (kind === 'quarter') return {from: addMonths(end, -2), to: end};
 if (kind === 'year12') return {from: addMonths(end, -11), to: end};
 if (kind === 'year') return {from: y + '-01-01', to: end};
 if (kind === 'lastyear') return {from: (y - 1) + '-01-01', to: (y - 1) + '-12-31'};
 return null;
}
function ensureQuickRanges() {
 const form = document.getElementById('filterPanel'); if (!form || form.querySelector('.ab-quick')) return;
 const wrap = el('div', {class: 'ab-quick', role: 'group', 'aria-label': 'Períodos rápidos'}, el('span', {class: 'ab-quick-label', text: 'Períodos rápidos:'}));
 [['month', 'Último mes con datos'], ['quarter', 'Últimos 3 meses'], ['year12', 'Últimos 12 meses'], ['year', 'Este año'], ['lastyear', 'Año anterior']].forEach(([kind, text]) => {
  const b = el('button', {type: 'button', class: 'ab-chip', text, 'data-quick': kind});
  b.addEventListener('click', () => {
   const range = quickRange(kind, last?.cutoff || document.getElementById('toInput')?.value); if (!range) return;
   document.getElementById('fromInput').value = range.from; document.getElementById('toInput').value = range.to;
   form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', {cancelable: true}));
  });
  wrap.append(b);
 });
 form.prepend(wrap);
}

// ---------- Dibujo ----------
function renderInsights() {
 if (!ui) return; const items = absenceInsights({analytics: last, days: dayData});
 ui.insights.replaceChildren(...items.map(i => el('li', {class: 'ab-insight', 'data-tone': i.tone, 'data-insight': i.key}, el('span', {class: 'ab-insight-label', text: i.label}), el('strong', {text: i.value}), el('span', {class: 'ab-insight-detail', text: i.detail}))));
 ui.insights.hidden = !items.length;
}

function hbar(m, items, {name, zoomed, total, color}) {
 const option = m.barOption({categories: items.map(i => short(i.label, zoomed ? 60 : 34)), values: items.map(i => i.count || 0), horizontal: true, name, color});
 option.series[0].label = {show: true, position: 'right', color: '#5d6f78', fontSize: 11, formatter: p => fmt(p.value) + (total ? '  ·  ' + pct(p.value, total) : '')};
 option.grid = {left: 8, right: 70, top: 8, bottom: 8, containLabel: true};
 option.yAxis.axisLabel = {color: '#33454f', fontSize: zoomed ? 13 : 11.5, width: zoomed ? 360 : 210, overflow: 'truncate'};
 option.xAxis.splitNumber = 3; option.tooltip = {trigger: 'item', formatter: p => `<b>${items[p.dataIndex]?.label ?? p.name}</b><br>${fmt(p.value)} eventos${total ? ' · ' + pct(p.value, total) : ''}`};
 return option;
}
const heightFor = n => Math.max(220, 34 * n + 30) + 'px';

async function render(analytics) {
 if (!analytics || typeof document === 'undefined') return;
 last = analytics; ensureQuickRanges();
 const s = ensureLayout(); if (!s) return;
 const monthly = Array.isArray(analytics.monthly) ? analytics.monthly : [], reasons = Array.isArray(analytics.reasons) ? analytics.reasons : [], sectors = Array.isArray(analytics.sectors) ? analytics.sectors : [];
 const total = analytics.summary?.events || 0, empty = !monthly.length || !(total > 0);
 s.root.hidden = empty; s.grid.classList.toggle('ab-charts-on', !empty); renderInsights(); if (empty) return;

 slotSpecs['absence-trend'] = {
  build: m => {
   const option = m.trendOption({points: monthly.map(i => [monthLabel(i.month) + (i.partial ? ' *' : ''), i.events || 0]), name: 'Eventos'});
   option.series.push({type: 'bar', name: 'Personas con eventos', data: monthly.map(i => i.contracts || 0), barMaxWidth: 22, itemStyle: {borderRadius: [5, 5, 0, 0], color: 'rgba(49,95,130,.35)'}, z: 1});
   option.xAxis.boundaryGap = true; option.yAxis.scale = false; option.series[0].label = {show: monthly.length <= 14, position: 'top', color: '#0f766e', fontWeight: 700, fontSize: 11, formatter: p => fmt(p.value)};
   option.legend = {top: 0, left: 0}; option.grid = {left: 8, right: 16, top: 44, bottom: 8, containLabel: true}; option.tooltip = {trigger: 'axis', valueFormatter: v => fmt(v)};
   return option;
  },
  rows: () => ({head: ['Mes', 'Eventos', 'Personas', 'Días declarados'], body: monthly.map(i => [monthLong(i.month) + (i.partial ? ' (incompleto)' : ''), fmt(i.events), fmt(i.contracts), days(i.declaredDays)])}),
 };
 const reasonItems = topWithOthers(reasons, 9);
 slotSpecs['absence-reasons'] = {
  build: (m, o = {}) => hbar(m, reasonItems, {name: 'Eventos', zoomed: o.zoom, total}),
  rows: () => ({head: ['Motivo', 'Eventos', '% del total'], body: [...reasons].sort((a, b) => (b.count || 0) - (a.count || 0)).map(r => [readableLabel(r.label), fmt(r.count), pct(r.count, total)])}),
  onClick: p => { const item = reasonItems[p.dataIndex]; if (item && !item.others) applyFilter('reasonSelect', item.label); },
 };
 const sectorItems = [...sectors].filter(i => (i.count || 0) > 0).sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 10);
 slotSpecs['absence-sectors'] = {
  build: (m, o = {}) => hbar(m, sectorItems, {name: 'Eventos', zoomed: o.zoom, total, color: '#315f82'}),
  rows: () => ({head: ['Sector', 'Eventos', '% del total'], body: [...sectors].sort((a, b) => (b.count || 0) - (a.count || 0)).map(r => [readableLabel(r.label), fmt(r.count), pct(r.count, total)])}),
  onClick: p => { const item = sectorItems[p.dataIndex]; if (item) applyFilter('sectorSelect', item.label); },
 };
 slotSpecs['absence-days'] = {
  build: m => { const o = m.barOption({categories: monthly.map(i => monthLabel(i.month) + (i.partial ? ' *' : '')), values: monthly.map(i => Number(i.declaredDays) || 0), name: 'Días declarados', color: '#d08c2f', format: days}); o.series[0].label.show = monthly.length <= 12; return o; },
  rows: () => ({head: ['Mes', 'Días declarados'], body: monthly.map(i => [monthLong(i.month), days(i.declaredDays)])}),
 };
 s.reasons.host.style.height = heightFor(reasonItems.length); s.sectors.host.style.height = heightFor(sectorItems.length);
 s.reasons.figure.hidden = !reasonItems.length; s.sectors.figure.hidden = !sectorItems.length;
 drawChart(s.trend.host, slotSpecs['absence-trend'].build, {ariaLabel: 'Eventos y personas con eventos por mes'});
 if (reasonItems.length) drawChart(s.reasons.host, slotSpecs['absence-reasons'].build, {ariaLabel: 'Eventos por motivo', onClick: slotSpecs['absence-reasons'].onClick});
 if (sectorItems.length) drawChart(s.sectors.host, slotSpecs['absence-sectors'].build, {ariaLabel: 'Eventos por sector', onClick: slotSpecs['absence-sectors'].onClick});
 drawChart(s.daysByMonth.host, slotSpecs['absence-days'].build, {ariaLabel: 'Días declarados por mes'});
 drawDaily(s, monthly);
 loadPeople();
}

async function drawDaily(s, monthly = []) {
 const token = ++dailyToken, query = window.__mcAbsenceQuery; dayData = null; s.calendar.figure.hidden = s.weekday.figure.hidden = !query; if (!query) return;
 try {
  const url = new URL(query, location.origin); url.searchParams.set('bucket', 'day');
  // Hasta doce meses de días: desde el primer día del undécimo mes anterior al último mes de la serie.
  const lastMonth = /^(\d{4})-(\d{2})/.exec(String(monthly.at(-1)?.month || ''));
  if (lastMonth) {
   const first = new Date(Date.UTC(Number(lastMonth[1]), Number(lastMonth[2]) - 12, 1)).toISOString().slice(0, 10);
   if (!(url.searchParams.get('from') > first)) url.searchParams.set('from', first);
  }
  const response = await fetch(url.pathname + url.search, {credentials: 'same-origin', cache: 'no-store', headers: {Accept: 'application/json'}});
  const payload = response.ok ? await response.json() : null; if (token !== dailyToken) return;
  const series = Array.isArray(payload?.data?.series) ? payload.data.series : [];
  const days = series.filter(r => isoDay(String(r.period || '').slice(0, 10))).map(r => [String(r.period).slice(0, 10), Number(r.events) || 0]);
  s.calendar.figure.hidden = s.weekday.figure.hidden = !days.length; if (!days.length) return;
  const sorted = days.map(d => d[0]).sort(), lastDay = sorted.at(-1), start = new Date(lastDay + 'T12:00:00'); start.setDate(start.getDate() - 364);
  const from = sorted[0] > start.toISOString().slice(0, 10) ? sorted[0] : start.toISOString().slice(0, 10);
  const shown = days.filter(d => d[0] >= from).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  dayData = shown; renderInsights();
  // Un único día extraordinario no debe dejar todo el mapa del mismo color claro: la escala se corta en el percentil 95.
  const ordered = shown.map(d => d[1]).filter(v => v > 0).sort((a, b) => a - b), scaleMax = Math.max(1, ordered[Math.floor(ordered.length * 0.95)] ?? 1);
  const peak = shown.reduce((b, d) => (d[1] > b[1] ? d : b), shown[0]);
  s.help.querySelector('[data-absence-peak]').textContent = peak ? 'Día con más inicios: ' + longDate(peak[0]) + ' · ' + fmt(peak[1]) + ' licencias.' : '';
  slotSpecs['absence-calendar'] = {
   build: (m, o = {}) => { const opt = m.calendarHeatmapOption({days: shown, range: [from, lastDay], label: 'licencias que empezaron ese día', max: scaleMax}); opt.visualMap.formatter = v => v >= scaleMax ? fmt(v) + ' o más' : fmt(v); opt.calendar.cellSize = ['auto', o.zoom ? 26 : 17]; opt.calendar.top = 40; opt.calendar.bottom = 52; opt.visualMap.text = ['Más licencias', 'Menos']; opt.visualMap.itemHeight = 180; return opt; },
   rows: () => ({head: ['Fecha', 'Licencias'], body: [...shown].sort((a, b) => b[1] - a[1]).slice(0, 31).map(d => [longDate(d[0]), fmt(d[1])])}),
  };
  const week = weekdayTotals(shown), maxDay = Math.max(...week.map(w => w.count));
  slotSpecs['absence-weekday'] = {
   build: m => { const o = m.barOption({categories: week.map(w => w.day), values: week.map(w => w.count), name: 'Inicios de licencia'}); o.xAxis.axisLabel = {interval: 0, formatter: v => v.slice(0, 3)}; o.series[0].colorBy = 'series'; o.series[0].data = week.map(w => ({value: w.count, itemStyle: {color: w.count === maxDay ? '#0f766e' : '#9fcfc4'}})); o.series[0].label.show = true; return o; },
   rows: () => ({head: ['Día', 'Licencias', '% del total'], body: week.map(w => [w.day, fmt(w.count), pct(w.count, week.reduce((a, b) => a + b.count, 0))])}),
  };
  const mounted = await drawChart(s.calendar.host, slotSpecs['absence-calendar'].build, {ariaLabel: 'Licencias por día'});
  drawChart(s.weekday.host, slotSpecs['absence-weekday'].build, {ariaLabel: 'Licencias por día de la semana'});
  if (mounted && token === dailyToken) (await loadCharts()).revealSeries?.(mounted.chart, shown);
 } catch { if (token === dailyToken) s.calendar.figure.hidden = s.weekday.figure.hidden = true; }
}

// ---------- Personas con más licencias ----------
function peopleUi() {
 const panel = document.getElementById('peoplePanel'); if (!panel) return null;
 if (!panel.__ab) {
  const slot = chartSlot('Top 10 de personas', {subtitle: 'Cantidad en el período y filtros elegidos', key: 'absence-people'}); slot.figure.classList.add('ab-card'); slot.figure.__mcRows = () => slotSpecs['absence-people']?.rows?.() ?? null;
  panel.querySelector('[data-people-chart]').append(slot.figure);
  panel.querySelectorAll('[data-order]').forEach(b => b.addEventListener('click', () => { peopleOrder = b.dataset.order; panel.querySelectorAll('[data-order]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); loadPeople(); }));
  panel.__ab = {panel, slot, status: panel.querySelector('[data-people-status]'), body: panel.querySelector('[data-people-rows]')};
 }
 return panel.__ab;
}
function clearPeople(message = '') {
 people = null; peopleSnapshot = null; peopleToken++; const p = peopleUi(); if (!p) return;
 p.body.replaceChildren(); p.status.textContent = message; p.slot.figure.hidden = true; delete slotSpecs['absence-people'];
}
async function loadPeople() {
 const p = peopleUi(), query = window.__mcAbsenceQuery; if (!p || !query) return;
 const token = ++peopleToken; p.status.textContent = 'Buscando las personas con más licencias…'; p.panel.setAttribute('aria-busy', 'true');
 try {
  const url = new URL(query, location.origin); url.searchParams.set('resource', 'absencepeople'); url.searchParams.delete('bucket'); url.searchParams.set('order', peopleOrder); url.searchParams.set('limit', '10');
  const response = await fetch(url.pathname + url.search, {credentials: 'same-origin', cache: 'no-store', headers: {Accept: 'application/json'}});
  if (token !== peopleToken) return;
  if (response.status === 403) { clearPeople('Tu usuario no tiene permiso para ver nombres de personas. Pedilo a quien administra la plataforma.'); return; }
  const payload = response.ok ? await response.json() : null; if (token !== peopleToken) return;
  if (!payload?.ok || !Array.isArray(payload.data)) { clearPeople('No se pudo leer el ranking ahora. Tocá «Actualizar» arriba para reintentar.'); return; }
  people = payload.data; peopleSnapshot = payload.meta?.snapshot ?? null; renderPeople(p);
 } catch { if (token === peopleToken) clearPeople('No se pudo leer el ranking ahora. Tocá «Actualizar» arriba para reintentar.'); }
 finally { if (token === peopleToken) p.panel.setAttribute('aria-busy', 'false'); }
}
function openPerson(row) {
 const range = last?.range || {};
 // El historial se abre con la misma fuente (snapshot) que usó el ranking.
 if (row.contractId && range.from && range.to) { document.dispatchEvent(new CustomEvent('mc:absence-person-open', {detail: {contractId: row.contractId, from: range.from.slice(0, 10), to: range.to.slice(0, 10), snapshot: peopleSnapshot}})); return; }
 // Sin contrato vinculado: historial exacto por legajo de origen (empresa + legajo), sin coincidencias parciales.
 if (row.legajo && row.companyId !== null && row.companyId !== undefined) openLegajoHistory(row);
}

// Historial exacto de un legajo de origen dentro del período y filtros del ranking, con la misma fuente (snapshot).
let legajoDialog = null;
function openLegajoHistory(row) {
 const query = window.__mcAbsenceQuery; if (!query) return;
 legajoDialog?.close();
 const who = row.name ? readableName(row.name) : 'Legajo ' + row.legajo, origin = document.activeElement, expected = peopleSnapshot;
 const dialog = el('dialog', {class: 'mc-zoom ab-history', 'aria-labelledby': 'abHistoryTitle'});
 const close = el('button', {type: 'button', class: 'button', text: 'Cerrar'}), status = el('p', {class: 'ab-history-status', role: 'status', 'aria-live': 'polite', text: 'Buscando las licencias de este legajo…'});
 const body = el('tbody'), more = el('button', {type: 'button', class: 'button', text: 'Ver más', hidden: true});
 const table = el('table', {class: 'mc-zoom-table'}, el('thead', {}, el('tr', {}, ...['Desde', 'Hasta', 'Motivo', 'Días declarados'].map((h, i) => el('th', {text: h, class: i === 3 ? 'num' : ''})))), body);
 dialog.append(el('header', {}, el('div', {}, el('h2', {id: 'abHistoryTitle', text: 'Licencias de ' + who}), el('p', {text: 'Legajo ' + row.legajo + ' · sólo este legajo, en el período y filtros elegidos'})), close),
  el('div', {class: 'mc-zoom-body'}, status, el('div', {class: 'mc-zoom-scroll'}, table), more));
 document.body.append(dialog);
 let page = 0, total = 0, shown = 0, alive = true, busy = false;
 const done = () => { alive = false; dialog.remove(); if (legajoDialog?.dialog === dialog) legajoDialog = null; if (origin?.isConnected) origin.focus(); };
 async function load() {
  if (busy || !alive) return; busy = true; more.disabled = true;
  try {
   const url = new URL(query, location.origin); url.searchParams.set('resource', 'absenceevents'); url.searchParams.delete('bucket');
   url.searchParams.set('companyId', String(row.companyId)); url.searchParams.set('legajo', String(row.legajo)); url.searchParams.set('page', String(page + 1)); url.searchParams.set('limit', '50');
   const response = await fetch(url.pathname + url.search, {credentials: 'same-origin', cache: 'no-store', headers: {Accept: 'application/json'}}), payload = response.ok ? await response.json() : null;
   if (!alive) return;
   if (response.status === 403) { status.textContent = 'Tu usuario no tiene permiso para ver el detalle por persona.'; return; }
   if (!payload?.ok || !Array.isArray(payload.data)) { status.textContent = 'No se pudo leer el historial ahora. Cerrá y volvé a intentar.'; return; }
   // Otra fuente que la del ranking: no se mezclan cortes.
   if (expected && JSON.stringify(payload.meta?.snapshot ?? null) !== JSON.stringify(expected)) { body.replaceChildren(); more.hidden = true; status.textContent = 'Los datos se actualizaron desde que se armó el ranking. Cerrá esta ventana y tocá «Actualizar» para ver todo con la misma fuente.'; return; }
   page++; total = payload.pagination?.total ?? payload.data.length;
   for (const e of payload.data) body.append(el('tr', {}, el('td', {text: shortDate(isoDay(String(e.eventDate || '').slice(0, 10)))}), el('td', {text: e.untilDate ? shortDate(isoDay(String(e.untilDate).slice(0, 10))) : 'No informada'}), el('td', {text: readableLabel(e.reason || '—')}), el('td', {class: 'num', text: e.sourceDeclaredDays === null || e.sourceDeclaredDays === undefined ? 'Sin informar' : days(e.sourceDeclaredDays)})));
   shown += payload.data.length; more.hidden = shown >= total;
   status.textContent = total === 0 ? 'Este legajo no tiene licencias en el período y filtros elegidos.' : 'Mostrando ' + fmt(shown) + ' de ' + fmt(total) + ' licencias de este legajo, de la más reciente a la más antigua.';
  } catch { if (alive) status.textContent = 'No se pudo leer el historial ahora. Cerrá y volvé a intentar.'; }
  finally { busy = false; more.disabled = false; }
 }
 close.addEventListener('click', () => dialog.close()); more.addEventListener('click', load);
 dialog.addEventListener('close', done); dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
 dialog.showModal(); legajoDialog = {dialog, close: () => dialog.open && dialog.close()}; load();
}
function renderPeople(p) {
 const rows = people || [], byDays = peopleOrder === 'days';
 if (!rows.length) { clearPeople('No hay personas con licencias para estos filtros.'); return; }
 p.status.textContent = (byDays ? 'Ordenado por días declarados en GRH.' : 'Ordenado por cantidad de licencias.') + ' Tocá «Ver historial» para ver las licencias de esa persona, y sólo las de ella.';
 const name = r => r.name ? readableName(r.name) : 'Legajo ' + (r.legajo || '—');
 p.body.replaceChildren(...rows.map((r, i) => {
  const button = el('button', {type: 'button', class: 'button ab-person-open', text: 'Ver historial', 'aria-label': 'Ver historial de ' + name(r)}); button.addEventListener('click', () => openPerson(r));
  return el('tr', {}, el('td', {class: 'ab-rank', text: String(i + 1)}), el('td', {}, el('strong', {text: name(r)}), el('span', {class: 'ab-sub', text: 'Legajo ' + (r.legajo || '—')})), el('td', {text: readableLabel(r.sector)}),
   el('td', {class: 'num', text: fmt(r.events)}), el('td', {class: 'num', text: personDays(r)}), el('td', {text: readableLabel(r.topReason || '—')}), el('td', {text: shortDate(r.lastEventDate)}), el('td', {}, button));
 }));
 slotSpecs['absence-people'] = {
  build: (m, o = {}) => { const items = rows.map(r => ({label: name(r), count: byDays ? Number(r.sourceDeclaredDays) || 0 : r.events})); const opt = hbar(m, items, {name: byDays ? 'Días declarados' : 'Licencias', zoomed: o.zoom, color: '#6b5ca5'}); if (byDays) opt.series[0].label.formatter = q => days(q.value); opt.tooltip.formatter = q => { const r = rows[q.dataIndex]; return `<b>${name(r)}</b> · legajo ${r.legajo || '—'}<br>${fmt(r.events)} licencias · días declarados: ${personDays(r)}<br>Motivo más frecuente: ${readableLabel(r.topReason || '—')}`; }; return opt; },
  rows: () => ({head: ['Persona', 'Licencias', 'Días declarados'], body: rows.map(r => [name(r) + ' (leg. ' + (r.legajo || '—') + ')', fmt(r.events), personDays(r)])}),
  onClick: q => rows[q.dataIndex] && openPerson(rows[q.dataIndex]),
 };
 p.slot.figure.hidden = false; p.slot.host.style.height = heightFor(rows.length);
 drawChart(p.slot.host, slotSpecs['absence-people'].build, {ariaLabel: 'Personas con más licencias', onClick: slotSpecs['absence-people'].onClick});
}
// «PEREZ, JUAN CARLOS» → «Perez, Juan Carlos»
export function readableName(value) {
 const raw = String(value || '').trim(); if (!raw || raw !== raw.toUpperCase()) return raw;
 return raw.toLowerCase().replace(/(^|[\s,.'-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

// ---------- PDF ----------
async function chartImage(m, build, {w = 1100, h = 460} = {}) {
 const host = el('div'); host.style.cssText = `position:fixed;left:-20000px;top:0;width:${w}px;height:${h}px;background:#fff`; document.body.append(host);
 try {
  const mounted = m.mountChart(host, {...build(m, {zoom: false, print: true}), animation: false});
  // mountChart dibuja en el siguiente cuadro (lazyUpdate): esperar antes de leer la imagen.
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); mounted.chart.getZr().flush();
  const url = mounted.chart.getDataURL({type: 'jpeg', pixelRatio: 2, backgroundColor: '#ffffff'}); mounted.dispose();
  const {dataUrlBytes} = await import('./absence-report-pdf.js'); return {jpeg: dataUrlBytes(url), px: {w: w * 2, h: h * 2}};
 } catch { return null; } finally { host.remove(); }
}
async function downloadPdf(event) {
 const button = event?.currentTarget; if (!last || button?.disabled) return;
 const label = button?.textContent; if (button) { button.disabled = true; button.textContent = 'Armando el PDF…'; }
 try {
  const [m, pdf] = await Promise.all([loadCharts(), import('./absence-report-pdf.js')]);
  const canvas = document.createElement('canvas').getContext('2d');
  const measure = (t, size, bold) => { canvas.font = `${bold ? 'bold ' : ''}${size}px Arial, Helvetica, sans-serif`; return canvas.measureText(String(t)).width; };
  const range = last.range || {}, filters = (document.getElementById('filterSummary')?.textContent || '').split(' · ').map(t => t.trim()).filter(t => t && !/^(desde|hasta) /.test(t) && !/^Sin filtros/.test(t)).join(' · ');
  const doc = pdf.createReportPdf({title: 'MuniControl · Municipalidad de Junín', subtitle: 'Informe de ausentismo', footer: 'Uso interno' + (people?.length ? ' · contiene datos personales: no compartir fuera del municipio' : '') + ' · Fuente: GRH al ' + shortDate(isoDay(String(last.cutoff || '').slice(0, 10))), measure});
  doc.heading('Informe de ausentismo', {size: 20, space: 4});
  doc.text('Período: ' + shortDate(isoDay(String(range.from || '').slice(0, 10))) + ' al ' + shortDate(isoDay(String(range.to || '').slice(0, 10))) + (filters ? ' · ' + filters : ''), {size: 9.5});
  doc.text('Generado el ' + new Intl.DateTimeFormat('es-AR', {dateStyle: 'long', timeStyle: 'short'}).format(new Date()) + '.', {size: 8.5, color: '#5d6f78'});
  doc.kpis([{label: 'Licencias registradas', value: fmt(last.summary?.events), note: 'Eventos que cumplen los filtros'}, {label: 'Personas con licencias', value: fmt(last.summary?.contracts), note: 'Personas distintas'}, {label: 'Días declarados en GRH', value: days(last.summary?.declaredDays), note: 'No son jornadas perdidas'}]);
  const insights = absenceInsights({analytics: last, days: dayData});
  if (insights.length) { doc.heading('Lo más importante', {size: 13}); insights.forEach(i => doc.text('• ' + i.label + ': ' + i.value + ' (' + i.detail + ')', {size: 9.5, color: '#18252d'})); }
  const add = async (key, title, note, size) => { const spec = slotSpecs[key]; if (!spec) return; const img = await chartImage(m, spec.build, size); if (!img) return; doc.keep(Math.min(290, 511 * img.px.h / img.px.w) + 60); doc.heading(title, {size: 13}); doc.image(img.jpeg, {px: img.px, caption: note, maxHeight: 290}); };
  await add('absence-trend', 'Licencias por mes', 'Línea: cantidad de licencias. Barras: personas distintas con licencias. * mes todavía incompleto.');
  await add('absence-reasons', 'Motivos más frecuentes', 'Cantidad de licencias por motivo y porcentaje sobre el total.', {w: 1100, h: Math.max(380, 40 * 10 + 40)});
  await add('absence-sectors', 'Sectores con más eventos', 'Sector actual de cada legajo; no reconstruye cambios de sector anteriores.', {w: 1100, h: 440});
  await add('absence-calendar', 'Mapa de calor: en qué días empiezan las licencias', 'Cada cuadrito es un día; las filas son los días de la semana (L a D). Más oscuro = más licencias ese día. ' + (ui?.help.querySelector('[data-absence-peak]')?.textContent || ''), {w: 1100, h: 300});
  await add('absence-weekday', 'Licencias según el día de la semana', 'Suma de inicios de licencia de cada día de la semana.', {w: 1100, h: 380});
  await add('absence-days', 'Días declarados por mes', 'Suma de días informados por GRH; no equivale a jornadas laborales perdidas.', {w: 1100, h: 380});
  if (people?.length) {
   await add('absence-people', 'Personas con más licencias (top 10)', peopleOrder === 'days' ? 'Ordenado por días declarados.' : 'Ordenado por cantidad de licencias.', {w: 1100, h: 440});
   doc.table([{label: '#', weight: 0.35}, {label: 'Persona', weight: 2.3}, {label: 'Legajo', weight: 0.7}, {label: 'Sector', weight: 1.4}, {label: 'Licencias', weight: 0.8, align: 'right'}, {label: 'Días', weight: 0.6, align: 'right'}, {label: 'Motivo más frecuente', weight: 2.2}],
    people.map((r, i) => [String(i + 1), r.name ? readableName(r.name) : '—', r.legajo || '—', readableLabel(r.sector), fmt(r.events), personDays(r), readableLabel(r.topReason || '—')]));
  }
  doc.heading('Cómo leer este informe', {size: 12});
  doc.text('Los datos son registros administrativos de GRH. «Días declarados» es la cantidad que informa GRH y no equivale a jornadas perdidas. Los rankings describen cantidades: no evalúan el desempeño de personas o sectores ni indican si una licencia estuvo justificada.', {size: 8.8});
  const bytes = doc.bytes(), url = URL.createObjectURL(new Blob([bytes], {type: 'application/pdf'}));
  const a = el('a', {href: url, download: `informe-ausentismo-${String(range.from || '').slice(0, 10)}-a-${String(range.to || '').slice(0, 10)}.pdf`}); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  if (button) button.textContent = 'PDF descargado ✓';
  setTimeout(() => { if (button) button.textContent = label; }, 2500);
 } catch { if (button) button.textContent = 'No se pudo armar el PDF. Reintentar'; }
 finally { if (button) button.disabled = false; }
}

function clear() { if (ui?.root) { ui.root.hidden = true; ui.grid.classList.remove('ab-charts-on'); } dayData = null; dailyToken++; clearPeople(''); closeChartZoom(); legajoDialog?.close(); }
if (typeof document !== 'undefined') {
 // Cada consulta (también al pasar de página en el listado) avisa «cleared»: los nombres se borran siempre y, si los
 // indicadores siguen siendo los mismos (sólo cambió la página de eventos), el ranking se vuelve a pedir.
 document.addEventListener('mc:absence-cleared', () => {
  const kept = last; clearPeople(''); closeChartZoom(); legajoDialog?.close();
  setTimeout(() => { if (kept && window.__mcLastAbsence === kept && !document.getElementById('mainContent')?.hidden && !document.hidden) loadPeople(); }, 0);
 });
 window.MuniControlAbsenceCharts = Object.freeze({render, clear});
 if (window.__mcLastAbsence) render(window.__mcLastAbsence);
}
