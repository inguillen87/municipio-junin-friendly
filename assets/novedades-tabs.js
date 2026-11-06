// Novedades: three tabs instead of one endless page. «Cargar» is the everyday own flow; the rest stays one click away.
import { mountSectionTabs } from './section-tabs.js';
const start = () => {
  const host = document.querySelector('nav[data-quickbar="novedades"]');
  if (!host || document.querySelector('.mc-section-tabs')) return;
  mountSectionTabs({
    host, storageKey: 'mc.novedades.tab', label: 'Secciones de Novedades',
    tabs: [
      { id: 'cargar', label: 'Cargar novedades', hint: 'Legajos, concepto y unidades', panels: ['#ownNativeBulkNovelties'] },
      { id: 'fijas', label: 'Novedades fijas', hint: 'Altas, vigencias y vencimientos', panels: ['#fixedNovelties'] },
      { id: 'otras', label: 'Archivos, relojes y lotes anteriores', hint: 'Planilla, TXT/CSV, preparte, anular y corregir', panels: ['#noveltyReferenceWorkspace'] },
    ],
  });
  // A folded block opens when its tab is shown, so the tab never lands on a closed summary.
  for (const id of ['fixedNovelties', 'noveltyReferenceWorkspace']) {
    const node = document.getElementById(id); if (!node) continue;
    new MutationObserver(() => { if (!node.classList.contains('mc-tab-off') && !node.hidden && node.tagName === 'DETAILS') node.open = true; }).observe(node, { attributes: true, attributeFilter: ['class', 'hidden'] });
    if (!node.classList.contains('mc-tab-off') && node.tagName === 'DETAILS') node.open = true;
  }
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
