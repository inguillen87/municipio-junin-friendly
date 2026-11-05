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
/** <figure> card with title, optional subtitle and a sized canvas host. */
export function chartSlot(title, {subtitle = '', size = 'md', key = ''} = {}) {
 ensureCss();
 const figure = document.createElement('figure'); figure.className = 'mc-chart-card'; figure.dataset.size = size; if (key) figure.dataset.chart = key;
 const caption = document.createElement('figcaption'), strong = document.createElement('strong'); strong.textContent = title; caption.append(strong);
 if (subtitle) { const small = document.createElement('span'); small.textContent = subtitle; caption.append(small); }
 const host = document.createElement('div'); host.className = 'mc-chart'; host.dataset.loading = 'true'; host.setAttribute('role', 'img'); host.setAttribute('aria-label', title);
 figure.append(caption, host); return {figure, host, caption};
}
/** Draws build(module) into host once the module is ready. Returns the mounted chart or null. */
export async function drawChart(host, build, {ariaLabel = '', onClick = null} = {}) {
 if (!host?.isConnected) return null;
 try {
  const m = await loadCharts(); if (!host.isConnected) return null;
  const mounted = m.mountChart(host, build(m), {ariaLabel}); host.dataset.loading = 'false';
  if (onClick) { mounted.chart.off('click'); mounted.chart.on('click', onClick); }
  return mounted;
 } catch { host.dataset.loading = 'error'; return null; }
}
