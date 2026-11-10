// Pestañas declarativas para pantallas largas: en lugar de una página interminable, cada pantalla muestra un grupo
// de secciones por vez. La pantalla declara las pestañas en un elemento `data-mc-tabs` (JSON con id, label, hint y,
// si hace falta, `sel` para bloques que otro módulo agrega después) y marca cada sección con `data-mc-tab="<id>"`.
// Sólo presentación: los permisos, los datos y el atributo `hidden` de cada sección siguen como estaban.
import { mountSectionTabs } from './section-tabs.js';
import './list-pager.js';

const start = () => {
  const host = document.querySelector('[data-mc-tabs]');
  if (!host || host.dataset.mcTabsMounted) return;
  let defs; try { defs = JSON.parse(host.dataset.mcTabs); } catch { return; }
  if (!Array.isArray(defs) || defs.length < 2) return;
  host.dataset.mcTabsMounted = '1';
  let serial = 0;
  const known = new WeakSet();
  const tabs = defs.map(d => ({ id: String(d.id), label: String(d.label), hint: d.hint ? String(d.hint) : '', panels: [] }));
  // Recorre el documento y suma los bloques todavía no registrados; devuelve true si encontró alguno nuevo.
  const collect = () => {
    let found = false;
    defs.forEach((d, i) => {
      if (d.sel) for (const el of document.querySelectorAll(d.sel)) if (!el.dataset.mcTab) el.dataset.mcTab = tabs[i].id;
      for (const el of document.querySelectorAll('[data-mc-tab="' + tabs[i].id + '"]')) {
        if (known.has(el)) continue; known.add(el); found = true;
        if (!el.id) el.id = 'mcTabPanel' + (++serial);
        tabs[i].panels.push('#' + CSS.escape(el.id));
      }
    });
    return found;
  };
  collect();
  const usable = tabs.filter(t => t.panels.length);
  if (usable.length < 2) return;
  // Un enlace que llega con un ancla propia de la pantalla (p. ej. #preview desde la ficha) abre su pestaña en esa visita.
  const initial = () => { const hash = decodeURIComponent(location.hash.slice(1)); if (!hash) return null; const i = defs.findIndex(d => String(d.hash || '').split(' ').includes(hash)); return i < 0 ? null : tabs[i].id; };
  const api = mountSectionTabs({ host, tabs, initial, storageKey: host.dataset.mcTabsKey || 'mc.tabs.' + location.pathname, label: host.dataset.mcTabsLabel || 'Secciones de la pantalla' });
  if (!api) return;
  document.documentElement.classList.add('mc-page-tabs-on');
  addEventListener('hashchange', () => { const id = initial(); if (id) api.show(id); });
  // Una acción de otra pestaña que apunta a un bloque de ésta (p. ej. «Ubicar en mapa») la trae al frente antes de que
  // el módulo dueño del bloque reaccione: `on` nombra el evento de documento que dispara esa acción.
  defs.forEach((d, i) => { for (const type of String(d.on || '').split(' ').filter(Boolean)) document.addEventListener(type, () => api.activate(tabs[i].id), true); });
  // Imprimir muestra todas las pestañas. Los gráficos de una pestaña que no se estaba viendo necesitan un instante para
  // dibujarse con su tamaño real, así que la impresión que pide la propia pantalla espera dos cuadros antes de abrirse.
  const root = document.documentElement, nativePrint = typeof window.print === 'function' ? window.print.bind(window) : null;
  let printing = false;
  const forPrint = on => { printing = on; root.classList.toggle('mc-tabs-all', on || searching()); };
  let searching = () => false;
  addEventListener('beforeprint', () => forPrint(true)); addEventListener('afterprint', () => forPrint(false));
  if (nativePrint) window.print = () => { forPrint(true); requestAnimationFrame(() => requestAnimationFrame(() => { try { nativePrint(); } finally { setTimeout(() => forPrint(false), 0); } })); };
  // Un índice propio de la pantalla que las pestañas reemplazan deja de mostrarse (vuelve al imprimir).
  if (host.dataset.mcTabsHide) for (const node of document.querySelectorAll(host.dataset.mcTabsHide)) node.classList.add('mc-tab-replaced');
  // Mientras se usa el buscador de la pantalla, los resultados se ven juntos, sin importar en qué pestaña están.
  const finder = host.dataset.mcTabsAllWhen && document.querySelector(host.dataset.mcTabsAllWhen);
  if (finder) { searching = () => Boolean(finder.value.trim()); const all = () => root.classList.toggle('mc-tabs-all', printing || searching()); finder.addEventListener('input', all); finder.addEventListener('change', all); all(); }
  // Bloques que llegan después (gráficos, paneles propios): quedan en su pestaña en cuanto aparecen.
  const scope = document.querySelector('main') || document.body;
  // Reaplicar la pestaña vigente puede tocar clases que este mismo observador mira: una sola pasada por cambio.
  let settling = false;
  const settle = () => { if (settling) return; settling = true; try { api.sync(); api.refresh(); } finally { queueMicrotask(() => { settling = false; }); } };
  const late = new MutationObserver(settle);
  let queued = false;
  new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; const before = new Set(tabs.flatMap(t => t.panels)); if (!collect()) return;
    for (const sel of tabs.flatMap(t => t.panels)) if (!before.has(sel)) { const node = document.querySelector(sel); if (node) late.observe(node, { attributes: true, attributeFilter: ['hidden', 'class'] }); }
    settle(); }); }).observe(scope, { childList: true, subtree: true });
  // Un enlace interno a un bloque de otra pestaña (aunque el ancla ya esté en la dirección) la trae al frente.
  document.addEventListener('click', e => {
    const link = e.target.closest?.('a[href^="#"]'); if (!link) return;
    const target = document.getElementById(decodeURIComponent(link.getAttribute('href').slice(1))); if (target) globalThis.mcSectionTabsReveal?.(target);
  }, true);
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
