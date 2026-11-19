// Paginador declarativo para tablas y listas largas: `data-mc-pager="10"` en el contenedor cuyos hijos directos son
// las filas o tarjetas (por ejemplo un <tbody>). Muestra de a una página, con buscador y «Anterior / Siguiente».
// Sólo presentación: no pide datos, no cambia filas ni usa el atributo `hidden`; al imprimir se ve la lista completa.
const fold = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
let serial = 0;

export function mountListPager(box) {
  if (!box || box.dataset.mcPagerMounted) return null;
  box.dataset.mcPagerMounted = '1';
  const size = Math.max(3, Number.parseInt(box.dataset.mcPager, 10) || 10);
  const noun = box.dataset.mcPagerNoun || 'filas';
  const table = box.closest('table');
  const anchor = table ? (table.parentElement?.matches('[class*="table"],[class*="scroll"]') ? table.parentElement : table) : box;
  const id = 'mcPager' + (++serial);
  const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const top = make('div', 'mc-pager mc-pager-top'), bottom = make('div', 'mc-pager mc-pager-bottom');
  const label = make('label', 'mc-pager-search'); const caption = make('span', '', 'Buscar en esta lista');
  const input = make('input'); input.type = 'search'; input.maxLength = 80; input.autocomplete = 'off'; input.placeholder = box.dataset.mcPagerPlaceholder || 'Escribí una palabra o un código';
  label.append(caption, input);
  // La pantalla ya tiene su propio buscador: `data-mc-pager-search="off"` deja sólo las páginas.
  if (box.dataset.mcPagerSearch === 'off') label.hidden = true;
  const status = make('p', 'mc-pager-status'); status.id = id; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); input.setAttribute('aria-describedby', id);
  const prev = make('button', 'mc-pager-button', '‹ Anterior'), next = make('button', 'mc-pager-button', 'Siguiente ›'); prev.type = next.type = 'button';
  const where = make('span', 'mc-pager-where');
  top.append(label, status); bottom.append(prev, where, next);
  anchor.before(top); anchor.after(bottom);
  let page = 0, query = '', count = -1;
  const rows = () => [...box.children].filter(n => !n.matches('.mc-pager-keep'));
  function apply(keepPage) {
    const all = rows(), q = fold(query), matched = q ? all.filter(n => fold(n.textContent).includes(q)) : all;
    const pages = Math.max(1, Math.ceil(matched.length / size)); if (!keepPage) page = 0; page = Math.min(Math.max(0, page), pages - 1);
    const from = page * size, shown = new Set(matched.slice(from, from + size));
    for (const n of all) n.classList.toggle('mc-page-off', !shown.has(n));
    // Si la pantalla oculta la lista (por ejemplo al cambiar de tarjetas a tabla), sus controles también se retiran.
    const long = all.length > size && !box.hidden;
    top.hidden = !long; bottom.hidden = !long || pages < 2;
    status.textContent = !matched.length ? 'Ninguna de las ' + all.length + ' ' + noun + ' coincide con la búsqueda.'
      : 'Mostrando ' + (from + 1) + ' a ' + (from + shown.size) + ' de ' + matched.length + ' ' + noun + (q ? ' encontradas (' + all.length + ' en total)' : '') + '.';
    where.textContent = 'Página ' + (page + 1) + ' de ' + pages; prev.disabled = page === 0; next.disabled = page >= pages - 1;
    count = all.length;
  }
  const turn = step => { page += step; apply(true); const y = top.getBoundingClientRect().top; if (y < 0) top.scrollIntoView({ block: 'start' }); };
  prev.addEventListener('click', () => turn(-1)); next.addEventListener('click', () => turn(1));
  input.addEventListener('input', () => { query = input.value; apply(false); });
  // Si la pantalla vuelve a dibujar la lista (otro filtro, datos nuevos) se pagina de nuevo desde el principio.
  new MutationObserver(() => apply(rows().length === count)).observe(box, { childList: true, attributes: true, attributeFilter: ['hidden'] });
  apply(false);
  return { refresh: () => apply(true) };
}

export function mountListPagers(root = document) { for (const box of root.querySelectorAll('[data-mc-pager]')) mountListPager(box); }
// Las listas que un módulo crea después de cargar la pantalla se paginan en cuanto aparecen.
const start = () => {
  mountListPagers();
  new MutationObserver(records => { for (const r of records) for (const node of r.addedNodes) if (node.nodeType === 1) { if (node.matches('[data-mc-pager]')) mountListPager(node); if (node.firstElementChild) mountListPagers(node); } }).observe(document.body, { childList: true, subtree: true });
};
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start(); }
