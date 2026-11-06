// Novedades: three tabs instead of one endless page. «Cargar» is the everyday own flow; the rest stays one click away.
import { mountSectionTabs } from './section-tabs.js';
import { GRH_CONCEPTS, CONCEPT_GROUPS, conceptInfo, conceptLabel } from './grh-concept-dictionary.js';
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

// Every concept field on this page (own flow, individual/quick load, sheet rows, TXT import) offers the same
// concept catalogue; movement fields suggest the usual values. Suggestions only: validation stays server-side.
const lists = () => {
  if (!document.getElementById('mcConceptList')) {
    const list = document.createElement('datalist'); list.id = 'mcConceptList';
    for (const c of [...GRH_CONCEPTS].sort((a, b) => Number(b.novelty) - Number(a.novelty) || b.uses - a.uses || Number(a.code) - Number(b.code))) {
      const o = document.createElement('option'); o.value = c.code; o.label = c.label + ' · ' + CONCEPT_GROUPS[c.group]; list.append(o);
    }
    const moves = document.createElement('datalist'); moves.id = 'mcMovementList';
    for (const [v, l] of [['standard', 'Normal'], ['adjustment', 'Ajuste']]) { const o = document.createElement('option'); o.value = v; o.label = l; moves.append(o); }
    document.body.append(list, moves);
  }
};
const isConcept = n => n.matches('#conceptSourceId,[data-n-import-concept]') || /concepto/i.test(n.getAttribute('aria-label') || '') || n.closest('td[data-label="Concepto"]');
const enhance = root => {
  for (const n of root.querySelectorAll ? root.querySelectorAll('input:not([type]),input[type=text],input[inputmode=numeric]') : []) {
    if (n.dataset.mcConceptList || n.hasAttribute('list') && n.getAttribute('list') !== 'mcConceptList') continue;
    if (n.id === 'movementType') { n.setAttribute('list', 'mcMovementList'); n.dataset.mcConceptList = '1'; continue; }
    if (!isConcept(n)) continue;
    n.setAttribute('list', 'mcConceptList'); n.setAttribute('autocomplete', 'off'); n.dataset.mcConceptList = '1';
    const hint = document.createElement('small'); hint.className = 'mc-concept-hint'; hint.setAttribute('aria-live', 'polite');
    const show = () => { const c = conceptInfo(n.value); hint.textContent = c ? conceptLabel(c) : ''; };
    n.addEventListener('input', show); n.addEventListener('change', show); n.after(hint); show();
  }
};
const startLists = () => { lists(); enhance(document); new MutationObserver(records => { for (const r of records) for (const node of r.addedNodes) if (node.nodeType === 1) enhance(node); }).observe(document.body, { childList: true, subtree: true }); };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startLists, { once: true }); else startLists();
