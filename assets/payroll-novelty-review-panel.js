import { noveltyReviewPage, noveltyIssuesCsv } from './payroll-novelty-review.js';
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
const button = (text, id) => { const b = el('button', text, 'button compact'); b.type = 'button'; b.id = id; return b; };
const amount = value => {
  if (value === null) return 'No informado';
  const n = BigInt(value), u = n < 0n ? -n : n;
  return `${n < 0n ? '-' : ''}$ ${(u / 100n).toLocaleString('es-AR')},${String(u % 100n).padStart(2, '0')}`;
};

export function mountNoveltyReviewPanel(host) {
  let rows = null, page = 1;
  const controls = el('div', undefined, 'novelty-review-controls');
  controls.dataset.reviewOnly = 'true';
  const kpis = el('div', undefined, 'novelty-review-kpis'); kpis.id = 'reviewCounts';
  const search = el('input'); search.type = 'search'; search.maxLength = 100; search.id = 'reviewSearch';
  search.placeholder = 'Legajo, concepto o fundamento';
  const kind = el('select'); kind.id = 'reviewKind';
  for (const [value, label] of [['all', 'Todas las filas'], ['missing', 'Sin importe informado'], ['manual', 'Con importe informado'], ['forced', 'Forzadas']]) {
    const option = el('option', label); option.value = value; kind.append(option);
  }
  const size = el('select'); size.id = 'reviewPageSize';
  for (const n of [25, 50, 100]) { const option = el('option', String(n)); option.value = String(n); size.append(option); }
  const filters = el('div', undefined, 'novelty-review-filters');
  for (const [name, input] of [['Buscar en el lote', search], ['Mostrar', kind], ['Filas por página', size]]) {
    const label = el('label', name); label.append(input); filters.append(label);
  }
  const reset = button('Limpiar filtros', 'reviewReset'); filters.append(reset);
  const note = el('p', 'Los filtros sólo cambian esta vista. Crear lote trazable guarda todas las filas validadas, no sólo las visibles.', 'panel-note');
  note.id = 'reviewScope';
  controls.append(kpis, filters, note);
  host.querySelector('.table-wrap').before(controls);
  const head = host.querySelector('thead tr'); head.replaceChildren();
  for (const text of ['Fila', 'Legajo', 'Concepto', 'Unidades', 'Importe', 'Forzado', 'Detalle']) { const th = el('th', text); th.scope = 'col'; head.append(th); }
  const nav = el('nav', undefined, 'novelty-review-pager'); nav.setAttribute('aria-label', 'Páginas de la revisión'); nav.dataset.reviewOnly = 'true';
  const previous = button('Anterior', 'reviewPrevious'), next = button('Siguiente', 'reviewNext');
  const range = el('span'); range.id = 'reviewRange'; range.setAttribute('role', 'status'); range.setAttribute('aria-live', 'polite');
  nav.append(previous, range, next); host.append(nav);
  const body = host.querySelector('tbody');
  function render() {
    if (!rows) return;
    const view = noveltyReviewPage(rows, { search: search.value, kind: kind.value, page, pageSize: Number(size.value) });
    page = view.page;
    kpis.replaceChildren();
    for (const [label, value] of [['Filas del lote', view.total], ['Legajos distintos', view.distinctLegajos], ['Sin importe informado', view.missing], ['Forzadas', view.forced]]) {
      const card = el('div'); card.append(el('span', label), el('strong', String(value))); kpis.append(card);
    }
    host.querySelector('#previewCaption').textContent = `${view.total} filas validadas estructuralmente. Todavía sin guardar; el servidor verificará legajos, conceptos y permisos.`;
    note.textContent = `Se guardarán ${view.total} filas. Buscar, filtrar y cambiar de página no modifica el lote. Los importes ausentes no se convierten en cero.`;
    range.textContent = view.filtered ? `${view.first}–${view.last} de ${view.filtered} · Página ${page} de ${view.pages}` : 'Sin coincidencias. El lote sigue completo.';
    previous.disabled = page === 1; next.disabled = page === view.pages;
    body.replaceChildren();
    for (const row of view.rows) {
      const tr = el('tr'); tr.dataset.reviewRow = String(row.rowOrdinal);
      for (const value of [row.rowOrdinal, row.legajo, row.conceptSourceId, row.quantityDecimal ?? 'No informado', amount(row.amountCents), row.forced ? 'Sí' : 'No']) {
        const td = el('td', String(value)); if (value === 'No informado') td.className = 'novelty-unvalued'; tr.append(td);
      }
      const cell = el('td'), details = el('details');
      const summary = el('summary', 'Ver campos'); summary.setAttribute('aria-label', `Ver todos los campos de la fila ${row.rowOrdinal}`);
      const list = el('dl', undefined, 'novelty-row-fields');
      for (const [label, value] of [['Centro de costo', row.costCenterSourceId], ['Mes de ajuste', row.adjustmentMonth?.slice(0, 7)], ['Movimiento', row.movementType], ['Instrumento legal', row.legalInstrument], ['Observación', row.observation]]) {
        list.append(el('dt', label), el('dd', value ?? 'No informado'));
      }
      details.append(summary, list); cell.append(details); tr.append(cell); body.append(tr);
    }
    if (!view.filtered) { const tr = el('tr'), td = el('td', 'No hay filas para este filtro. Limpiá los filtros para revisar el lote completo.'); td.colSpan = 7; tr.append(td); body.append(tr); }
  }
  for (const input of [search, kind, size]) input.addEventListener(input === search ? 'input' : 'change', () => { page = 1; render(); });
  reset.addEventListener('click', () => { search.value = ''; kind.value = 'all'; page = 1; render(); });
  previous.addEventListener('click', () => { page--; render(); }); next.addEventListener('click', () => { page++; render(); });
  return {
    render,
    setRows(value) { rows = value; page = 1; search.value = ''; kind.value = 'all'; render(); host.hidden = false; },
    clear() { rows = null; page = 1; body.replaceChildren(); kpis.replaceChildren(); range.textContent = ''; search.value = ''; kind.value = 'all'; host.querySelector('#previewCaption').textContent = ''; note.textContent = ''; host.hidden = true; },
  };
}

export function mountNoveltyIssues(host) {
  let issues = null;
  const title = el('h3', 'Corregí estas incidencias antes de guardar'); title.id = 'noveltyIssuesTitle';
  host.setAttribute('aria-labelledby', title.id);
  const count = el('p'); count.id = 'noveltyIssueCount'; count.setAttribute('role', 'status');
  const download = button('Descargar incidencias CSV', 'noveltyIssuesDownload');
  const wrap = el('div', undefined, 'table-wrap'), table = el('table'), head = el('thead'), header = el('tr');
  for (const text of ['Fila de datos', 'Línea del CSV', 'Incidencia']) { const th = el('th', text); th.scope = 'col'; header.append(th); }
  head.append(header); const body = el('tbody'); body.id = 'noveltyIssueRows'; table.append(head, body); wrap.append(table);
  host.append(title, count, download, wrap);
  download.addEventListener('click', () => {
    if (!issues) return;
    const blob = new Blob([noveltyIssuesCsv(issues)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = el('a'); a.href = url; a.download = 'municontrol_incidencias_novedades.csv';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  });
  return {
    clear() { issues = null; body.replaceChildren(); count.textContent = ''; host.hidden = true; },
    show(error) {
      issues = error.issues;
      header.children[1].textContent = error.origin === 'screen' ? 'Origen' : 'Línea del CSV';
      count.textContent = `${issues.length} incidencias${error.rowCount ? ` en ${error.rowCount} filas examinadas` : ''}. No se guardó ninguna fila. Se muestra una causa por cada fila inválida y cada duplicado detectado.`;
      body.replaceChildren(...issues.map(i => { const tr = el('tr'); for (const value of [i.rowOrdinal ?? 'Estructura', i.line ?? 'Pantalla', i.message]) tr.append(el('td', String(value))); return tr; }));
      host.hidden = false;
    },
  };
}
