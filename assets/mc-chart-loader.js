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
/** Draws build(module, {zoom}) into host once the module is ready. Returns the mounted chart or null. */
export async function drawChart(host, build, {ariaLabel = '', onClick = null} = {}) {
 if (!host?.isConnected) return null;
 try {
  const m = await loadCharts(); if (!host.isConnected) return null;
  const mounted = m.mountChart(host, build(m, {zoom: host.dataset.mcZoom === 'true'}), {ariaLabel}); host.dataset.loading = 'false';
  if (onClick) { mounted.chart.off('click'); mounted.chart.on('click', onClick); }
  // Lo último dibujado es lo que «Ampliar» vuelve a dibujar en grande.
  if (host.dataset.mcZoom !== 'true') { host.__mcDraw = {build, ariaLabel, onClick}; const button = host.closest('.mc-chart-card')?.querySelector('.mc-chart-expand'); if (button) button.hidden = false; }
  return mounted;
 } catch { host.dataset.loading = 'error'; return null; }
}

let openZoom = null;
const make = (tag, props = {}, ...children) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v); } n.append(...children.filter(Boolean)); return n; };
const fileName = text => (String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'grafico');
/** Closes the enlarged chart, if any (screens that withdraw private data call it). */
export function closeChartZoom() { openZoom?.close(); }
/**
 * Enlarged view of a drawn chart: same data, bigger canvas, optional numbers table and image download.
 * The card may provide figure.__mcRows = () => ({head: [...], body: [[...]]}) to list its numbers.
 */
export function openChartZoom(slot) {
 const draw = slot?.host?.__mcDraw; if (!draw || typeof document === 'undefined') return;
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
 let mounted = null;
 const done = () => { try { mounted?.dispose(); } catch { /* ya liberado */ } dialog.remove(); if (openZoom?.dialog === dialog) openZoom = null; if (slot.expand?.isConnected) slot.expand.focus(); };
 close.addEventListener('click', () => dialog.close()); dialog.addEventListener('close', done); dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
 save.disabled = true;
 save.addEventListener('click', () => { if (!mounted) return; const a = make('a', {href: mounted.chart.getDataURL({type: 'png', pixelRatio: 2, backgroundColor: '#ffffff'}), download: fileName(title) + '.png'}); document.body.append(a); a.click(); a.remove(); });
 dialog.showModal(); openZoom = {dialog, close: () => dialog.open && dialog.close()};
 requestAnimationFrame(async () => { mounted = await drawChart(host, draw.build, {ariaLabel: draw.ariaLabel, onClick: draw.onClick ? p => { dialog.close(); draw.onClick(p); } : null}); save.disabled = !mounted; });
}
