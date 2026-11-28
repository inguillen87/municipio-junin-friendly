// Shared, lazy chart slots. A screen asks for a slot, then draws into it; ECharts (assets/mc-charts.js) and its CSS
// are fetched only the first time a chart is actually drawn. Failures leave the existing tables and figures intact.
let chartsModule = null;
const cssHref = new URL('./mc-charts.css', import.meta.url).href;
function ensureCss() {
 if (typeof document === 'undefined' || [...document.querySelectorAll('link[rel=stylesheet]')].some(l => l.href === cssHref)) return;
 const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = cssHref; document.head.append(link);
}
export function loadCharts() {
 ensureCss();
 chartsModule ??= import(new URL('./mc-charts.js', import.meta.url).href).catch(error => { chartsModule = null; throw error; });
 return chartsModule;
}
/** <figure> card with title, optional subtitle and a sized canvas host. Every card gets «Ampliar» unless expand:false. */
export function chartSlot(title, {subtitle = '', size = 'md', key = '', expand = true} = {}) {
 ensureCss();
 const figure = document.createElement('figure'); figure.className = 'mc-chart-card'; figure.dataset.size = size; if (key) figure.dataset.mcChart = key;
 const caption = document.createElement('figcaption'), strong = document.createElement('strong'); strong.textContent = title; caption.append(strong);
 if (subtitle) { const small = document.createElement('span'); small.textContent = subtitle; caption.append(small); }
 const host = document.createElement('div'); host.className = 'mc-chart'; host.dataset.loading = 'true'; host.setAttribute('role', 'img'); host.setAttribute('aria-label', title);
 figure.append(caption, host);
 const slot = {figure, host, caption};
 if (expand) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'mc-chart-expand'; button.title = 'Ampliar'; button.setAttribute('aria-label', 'Ampliar ' + title);
  const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true'); icon.textContent = '⤢'; const label = document.createElement('span'); label.textContent = 'Ampliar';
  button.append(icon, label); button.hidden = true; button.addEventListener('click', () => openChartZoom(slot));
  caption.append(button); caption.classList.add('mc-chart-caption'); slot.expand = button;
 }
 return slot;
}

// A zoom belongs to one drawn source, not merely to a DOM element that may be
// reused after a new query. Panels remain responsible for authorizing their data.
const sourceDraws = new WeakMap();
let contextRevision = 0, openZoom = null;
function retireDraw(host, draw) {
 if (!draw || sourceDraws.get(host) !== draw) return;
 sourceDraws.delete(host);
 const button = host.closest('.mc-chart-card')?.querySelector('.mc-chart-expand'); if (button) button.hidden = true;
 if (openZoom?.source === draw) closeChartZoom();
}
function sourceIsCurrent(slot, draw) {
 if (!draw || document.hidden || draw.contextRevision !== contextRevision || sourceDraws.get(slot.host) !== draw
  || !slot.figure.isConnected || !slot.host.isConnected || !slot.figure.contains(slot.host)
  || !draw.mounted || draw.mounted.chart.isDisposed() || !slot.host.querySelector('canvas,svg')
  || slot.host.closest('[hidden],[aria-hidden="true"],[inert]')) return false;
 const style = getComputedStyle(slot.host), rect = slot.host.getBoundingClientRect();
 return style.visibility !== 'hidden' && style.visibility !== 'collapse' && rect.width > 0 && rect.height > 0;
}
/** Draws build(module, {zoom}) into host once the module is ready. Returns the mounted chart or null. */
export async function drawChart(host, build, {ariaLabel = '', onClick = null} = {}) {
 if (!host?.isConnected) return null;
 const zoom = host.dataset.mcZoom === 'true';
 const source = zoom ? null : {build, ariaLabel, onClick, contextRevision, mounted: null};
 if (source) { retireDraw(host, sourceDraws.get(host)); sourceDraws.set(host, source); }
 try {
  const m = await loadCharts();
  if (!host.isConnected || source && (sourceDraws.get(host) !== source || source.contextRevision !== contextRevision)) { retireDraw(host, source); return null; }
  const mounted = m.mountChart(host, build(m, {zoom}), {ariaLabel}); host.dataset.loading = 'false';
  if (onClick) { mounted.chart.off('click'); mounted.chart.on('click', onClick); }
  // Lo último dibujado es lo que «Ampliar» vuelve a dibujar en grande.
  if (source) {
   source.mounted = mounted;
   for (const method of ['dispose', 'update']) {
    const original = mounted[method];
    mounted[method] = (...args) => { const current = sourceDraws.get(host); if (current?.mounted?.chart === mounted.chart) retireDraw(host, current); return original.apply(mounted, args); };
   }
   const button = host.closest('.mc-chart-card')?.querySelector('.mc-chart-expand'); if (button) button.hidden = false;
  }
  return mounted;
 } catch { retireDraw(host, source); host.dataset.loading = 'error'; return null; }
}

const make = (tag, props = {}, ...children) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v); } n.append(...children.filter(Boolean)); return n; };
const fileName = text => (String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'grafico');
/** Closes the enlarged chart, if any (screens that withdraw private data call it). */
export function closeChartZoom() { openZoom?.close(); }
/**
 * Enlarged view of a drawn chart: same data, bigger canvas, optional numbers table and image download.
 * The card may provide figure.__mcRows = () => ({head: [...], body: [[...]]}) to list its numbers.
 */
export function openChartZoom(slot) {
 const draw = sourceDraws.get(slot?.host); if (typeof document === 'undefined' || !sourceIsCurrent(slot, draw)) return;
 openZoom?.close();
 const title = slot.caption?.querySelector('strong')?.textContent || 'Gráfico', subtitle = slot.caption?.querySelector('strong + span')?.textContent || '';
 const save = make('button', {type: 'button', class: 'button', text: 'Descargar imagen'}), close = make('button', {type: 'button', class: 'button', text: 'Cerrar'});
 const host = make('div', {class: 'mc-chart mc-zoom-chart', role: 'img', 'aria-label': title, 'data-mc-zoom': 'true', 'data-loading': 'true'});
 const body = make('div', {class: 'mc-zoom-body'}, host);
 const rows = typeof slot.figure.__mcRows === 'function' ? slot.figure.__mcRows() : null;
 if (rows?.body?.length) {
  const table = make('table', {class: 'mc-zoom-table'}, make('thead', {}, make('tr', {}, ...rows.head.map((h, i) => make('th', {text: h, class: i ? 'num' : ''})))), make('tbody', {}, ...rows.body.map(r => make('tr', {}, ...r.map((c, i) => make('td', {text: c, class: i ? 'num' : ''}))))));
  const details = make('details', {class: 'mc-zoom-data'}, make('summary', {text: 'Ver los números (' + rows.body.length + ' filas)'}), make('div', {class: 'mc-zoom-scroll'}, table)); details.open = rows.body.length <= 14; body.append(details);
 }
 const dialog = make('dialog', {class: 'mc-zoom', 'aria-label': title}, make('header', {}, make('div', {}, make('h2', {text: title}), subtitle ? make('p', {text: subtitle}) : null), make('div', {class: 'mc-zoom-actions'}, save, close)), body);
 document.body.append(dialog);
 const from = slot.figure.getBoundingClientRect(); dialog.style.setProperty('--mc-from-x', (from.left + from.width / 2 - innerWidth / 2) + 'px'); dialog.style.setProperty('--mc-from-y', (from.top + from.height / 2 - innerHeight / 2) + 'px');
 let mounted = null, observer = null, closed = false;
 const current = () => !closed && sourceIsCurrent(slot, draw);
 const done = () => {
  if (closed) return; closed = true;
  observer?.disconnect(); window.removeEventListener('resize', verifySource);
  save.disabled = true; save.removeEventListener('click', download); close.removeEventListener('click', done);
  dialog.removeEventListener('close', done); dialog.removeEventListener('click', backdrop);
  const previous = mounted; mounted = null; try { previous?.dispose(); } catch { /* ya liberado */ }
  if (dialog.open) dialog.close();
  // Clear even detached DOM handles: no nominal table, canvas or live exporter remains.
  dialog.replaceChildren(); dialog.remove();
  if (openZoom?.dialog === dialog) openZoom = null;
  if (slot.expand?.isConnected && sourceIsCurrent(slot, draw)) slot.expand.focus();
 };
 const verifySource = () => { if (!current()) done(); };
 const backdrop = event => { if (event.target === dialog) done(); };
 const download = () => {
  // Also guard the same event turn, before MutationObserver can report withdrawal.
  if (!current()) { done(); return; }
  if (!mounted || mounted.chart.isDisposed()) return;
  const a = make('a', {href: mounted.chart.getDataURL({type: 'png', pixelRatio: 2, backgroundColor: '#ffffff'}), download: fileName(title) + '.png'});
  document.body.append(a); a.click(); a.remove();
 };
 close.addEventListener('click', done); dialog.addEventListener('close', done); dialog.addEventListener('click', backdrop);
 save.disabled = true;
 save.addEventListener('click', download);
 observer = new MutationObserver(records => { if (records.some(record => !dialog.contains(record.target))) verifySource(); });
 observer.observe(document.documentElement, {subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'inert', 'style', 'class', 'open']});
 window.addEventListener('resize', verifySource);
 dialog.showModal(); openZoom = {dialog, source: draw, close: done};
 requestAnimationFrame(async () => {
  if (!current()) { done(); return; }
  const next = await drawChart(host, draw.build, {ariaLabel: draw.ariaLabel, onClick: draw.onClick ? p => { if (!current()) { done(); return; } done(); draw.onClick(p); } : null});
  if (!current()) { next?.dispose(); done(); return; }
  mounted = next; save.disabled = !mounted;
 });
}

if (typeof document !== 'undefined') {
 document.addEventListener('visibilitychange', () => { if (document.hidden) closeChartZoom(); });
 document.addEventListener('municontrol:capabilities-ready', () => { contextRevision++; closeChartZoom(); });
 document.addEventListener('taskchange', closeChartZoom);
 window.addEventListener('pagehide', closeChartZoom);
}
