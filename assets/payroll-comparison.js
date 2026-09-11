import { payrollSourceReport } from './payroll-source-report-model.js';
import { createPayrollComparison, comparisonView, comparisonDocument, comparisonSourcesUnchanged,
  comparisonTypeLabel, comparisonClosureLabel, comparisonMoney } from './payroll-comparison-model.js';
import { saveReport } from './report-document.js';
import { civilDate } from './civil-date.js';

const node = (tag, text, cls) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
};
const displayDate = date => civilDate(date).split('-').reverse().join('/');

/** Isolated, read-only task. Source responses are never stored in browser storage. */
export function mountPayrollComparison(host) {
  host.classList.add('pc-workbench');
  host.innerHTML = `
    <header class="rc-panel-head"><p class="rc-eyebrow">Control de variaciones</p>
      <h2>Comparar liquidaciones</h2><p>Elegí una liquidación base y otra del mismo tipo. Revisá cambios por concepto sin reconstruir planillas ni modificar sueldos.</p></header>
    <div class="rc-downloads"><button type="button" class="rc-button" data-pc-catalog>Consultar liquidaciones</button>
      <button type="button" class="rc-button secondary" data-pc-cancel hidden>Cancelar consulta</button></div>
    <p data-pc-status role="status" aria-live="polite">Consultá las liquidaciones disponibles para tu sesión.</p>
    <a data-pc-login hidden class="rc-button secondary">Ingresar al portal interno</a>
    <form data-pc-query class="rc-filter" hidden>
      <label>1. Liquidación base<select data-pc-base required><option value="">Elegí la base</option></select></label>
      <label>2. Liquidación comparada<select data-pc-target required disabled><option value="">Elegí la comparada</option></select></label>
      <button type="submit" class="rc-button" data-pc-compare disabled>Comparar</button>
    </form>
    <p class="pc-guidance" data-pc-selection></p>
    <div data-pc-result hidden>
      <div class="pc-sources" data-pc-sources></div>
      <p class="pc-guidance" data-pc-warnings></p>
      <div class="rc-filter" data-pc-filters>
        <label>Mostrar<select data-pc-group><option value="concepts">Conceptos sin totalizadores</option><option value="totals">Solo totalizadores</option><option value="all">Todos los códigos</option></select></label>
        <label>Estado<select data-pc-change><option value="all">Todos</option><option value="changed">Con cambios o incidencias</option><option value="review">Para revisar</option><option value="unchanged">Sin variación</option></select></label>
        <label>Buscar concepto<input data-pc-search type="search" maxlength="100" placeholder="Código o descripción"></label>
        <label>Orden<select data-pc-sort><option value="code">Código</option><option value="difference">Mayor diferencia absoluta</option></select></label>
        <button type="button" class="rc-button secondary" data-pc-reset>Restablecer filtros</button>
      </div>
      <div class="rc-kpis pc-kpis"><div><span>Códigos del filtro</span><strong data-pc-count></strong></div>
        <div><span>Con variación de importe</span><strong data-pc-variations></strong></div>
        <div><span>Para revisar</span><strong data-pc-review></strong></div></div>
      <div class="rc-downloads"><button type="button" class="rc-button" data-pc-format="pdf">Descargar PDF</button>
        <button type="button" class="rc-button" data-pc-format="xlsx">Descargar Excel</button>
        <button type="button" class="rc-button secondary" data-pc-format="csv">Descargar CSV</button></div>
      <p class="pc-guidance">Diferencia = comparada − base. Los faltantes no se convierten en cero. La cantidad de legajos no identifica a las mismas personas. Ninguna variación se presume error o ahorro.</p>
      <p data-pc-empty class="rc-empty" hidden>Sin resultados para estos filtros. No se exportarán códigos ocultos.</p>
      <div class="rc-table-wrap pc-table-wrap" tabindex="0" role="region" aria-label="Comparación por concepto; desplazamiento horizontal disponible">
        <table class="rc-table pc-table"><caption>Importes agregados por concepto en las dos liquidaciones</caption><thead><tr>
          <th scope="col">Código / concepto</th><th scope="col">Base</th><th scope="col">Comparada</th>
          <th scope="col">Diferencia</th><th scope="col">Variación %</th><th scope="col">Estado</th>
        </tr></thead><tbody data-pc-rows></tbody></table></div>
      <details class="pc-trace"><summary>Fuentes y alcance de la comparación</summary><dl data-pc-trace></dl></details>
    </div>`;
  const $ = selector => host.querySelector(selector);
  const status = $('[data-pc-status]'), result = $('[data-pc-result]');
  const baseSelect = $('[data-pc-base]'), targetSelect = $('[data-pc-target]');
  const formats = [...host.querySelectorAll('[data-pc-format]')];
  const taskPage = location.pathname.endsWith('nomina-control.html') ? 'nomina-control.html' : 'reportes-rrhh.html';
  $('[data-pc-login]').href = 'login.html?next=' + encodeURIComponent(taskPage + '#comparar');
  let catalog = [], model = null, operation = null, sequence = 0;
  const filters = () => ({ group: $('[data-pc-group]').value, change: $('[data-pc-change]').value,
    search: $('[data-pc-search]').value, sort: $('[data-pc-sort]').value });
  const active = () => host.isConnected && !host.closest('[role="tabpanel"]')?.hidden && document.visibilityState !== 'hidden';
  function controls() {
    const busy = operation !== null;
    host.setAttribute('aria-busy', String(busy));
    $('[data-pc-cancel]').hidden = !busy;
    $('[data-pc-catalog]').disabled = busy;
    $('[data-pc-compare]').disabled = busy || !baseSelect.value || !targetSelect.value;
    formats.forEach(button => button.disabled = busy || !model);
  }
  function cancel() {
    sequence++;
    if (operation) { clearTimeout(operation.timer); operation.controller.abort(); operation = null; }
    controls();
  }
  function clearResult() {
    model = null; result.hidden = true;
    $('[data-pc-rows]').replaceChildren(); $('[data-pc-sources]').replaceChildren(); $('[data-pc-trace]').replaceChildren();
    $('[data-pc-warnings]').textContent = '';
    for (const field of ['count', 'variations', 'review']) $('[data-pc-' + field + ']').textContent = '';
    controls();
  }
  function resetCatalog() {
    catalog = [];
    baseSelect.replaceChildren(new Option('Elegí la base', ''));
    targetSelect.replaceChildren(new Option('Elegí la comparada', '')); targetSelect.disabled = true;
    $('[data-pc-query]').hidden = true; $('[data-pc-selection]').textContent = '';
    controls();
  }
  function start(message) {
    cancel();
    const op = { id: sequence, controller: new AbortController() };
    op.timer = setTimeout(() => op.controller.abort(new Error('La consulta tardó demasiado. Reintentá.')), 30000);
    operation = op; status.textContent = message; status.dataset.error = 'false'; controls();
    return op;
  }
  const current = op => operation === op && op.id === sequence && active() && !op.controller.signal.aborted;
  function finish(op) {
    clearTimeout(op.timer);
    if (operation === op) { operation = null; controls(); }
  }
  function failure(error, op) {
    if (operation !== op || op.id !== sequence || !active()) return;
    clearResult();
    if (error.code === 'AUTH') { resetCatalog(); $('[data-pc-login]').hidden = false; }
    status.dataset.error = 'true';
    status.textContent = op.controller.signal.aborted ? 'La consulta se interrumpió. Reintentá.' : error.message;
    op.controller.abort();
  }
  async function request(id, op) {
    const query = new URLSearchParams({ resource: 'payrollsourcereport' });
    if (id) query.set('datasetId', id);
    let response;
    try { response = await fetch('/api/internal-data?' + query, { credentials: 'same-origin', cache: 'no-store',
      headers: { Accept: 'application/json' }, signal: op.controller.signal }); }
    catch (error) { if (op.controller.signal.aborted) throw error; throw Error('No se pudo conectar con la fuente. Revisá la conexión y reintentá.'); }
    if (response.status === 401 || response.status === 403) {
      const error = Error('La sesión no permite consultar nómina. Ingresá nuevamente con un usuario autorizado.');
      error.code = 'AUTH'; throw error;
    }
    if (!response.ok) throw Error('No se pudo consultar la fuente. Reintentá sin cambiar los datos originales.');
    let payload;
    try { payload = await response.json(); } catch { throw Error('La fuente no respondió un reporte válido. Reintentá.'); }
    if (payload.ok !== true) throw Error('La fuente no respondió un reporte válido.');
    const data = payrollSourceReport(payload.data);
    if (!id && data.mode !== 'catalog' || id && (data.mode !== 'report' || !data.found || data.datasetId !== id)) {
      throw Error('La liquidación ya no está disponible. Consultá el catálogo nuevamente.');
    }
    return data;
  }
  function options(items, select, placeholder) {
    select.replaceChildren(new Option(placeholder, ''));
    for (const item of items) {
      const label = `${displayDate(item.date)} · ${comparisonTypeLabel(item.type)} · ${comparisonClosureLabel(item.closureStatus)} · ${item.statementCount} legajos · ${item.sourceLabel.slice(0, 60)} · ${item.datasetId.slice(0, 8)}`;
      select.append(new Option(label, item.datasetId));
    }
  }
  function render() {
    if (!model) return;
    const view = comparisonView(model, filters());
    $('[data-pc-count]').textContent = view.count;
    $('[data-pc-variations]').textContent = view.variations;
    $('[data-pc-review]').textContent = view.review;
    $('[data-pc-empty]').hidden = view.count !== 0;
    const rows = view.rows.map(row => {
      const tr = node('tr'); tr.dataset.pcCode = row.code;
      const name = node('th'); name.scope = 'row'; name.append(node('strong', row.code), node('span', row.description));
      if (row.totalizer) name.append(node('small', 'Totalizador de origen', 'pc-tag'));
      tr.append(name);
      for (const side of ['base', 'target']) {
        const td = node('td', row[side + 'Present'] ? comparisonMoney(row[side + 'Amount']) : 'No figura', 'pc-money');
        td.append(node('small', row[side + 'Present'] ? row[side + 'Count'] + ' legajos con concepto' : 'No se presume cero'));
        tr.append(td);
      }
      tr.append(node('td', row.delta === null ? 'No evaluable' : comparisonMoney(row.delta), 'pc-money'));
      tr.append(node('td', row.percent));
      const state = node('td'); const badge = node('span', row.state, 'pc-tag'); badge.dataset.review = String(row.review); state.append(badge); tr.append(state);
      return tr;
    });
    $('[data-pc-rows]').replaceChildren(...rows);
    result.hidden = false; controls();
  }
  function showSources() {
    const cards = [['Base', model.base], ['Comparada', model.target]].map(([label, data]) => {
      const card = node('section', undefined, 'pc-source-card'); card.setAttribute('aria-label', 'Liquidación ' + label.toLowerCase());
      card.append(node('p', label, 'rc-eyebrow'), node('h3', displayDate(data.date)), node('p', comparisonTypeLabel(data.type)),
        node('p', data.sourceLabel), node('span', comparisonClosureLabel(data.closureStatus), 'pc-tag'), node('p', data.statementCount + ' legajos de esta liquidación'));
      return card;
    });
    $('[data-pc-sources]').replaceChildren(...cards);
    const warnings = [];
    if (model.nonClosed) warnings.push('Alguna fuente no informa cierre. No es una comparación de liquidaciones certificadas.');
    if (model.differentPopulationSize) warnings.push('Las liquidaciones tienen distinta cantidad de legajos; las variaciones agregadas también pueden deberse a esa diferencia.');
    if (model.sameDate) warnings.push('Misma fecha: estás comparando dos conjuntos de origen distintos.');
    if (model.reversedDates) warnings.push('La comparada es anterior a la base. El signo conserva el orden elegido.');
    $('[data-pc-warnings]').textContent = warnings.join(' ');
    const trace = comparisonDocument(model, filters()).metadata;
    $('[data-pc-trace]').replaceChildren(...trace.flatMap(([key, value]) => [node('dt', key), node('dd', String(value))]));
  }
  $('[data-pc-catalog]').addEventListener('click', async () => {
    clearResult(); resetCatalog(); $('[data-pc-login]').hidden = true;
    const op = start('Consultando liquidaciones disponibles…');
    try {
      const data = await request(null, op); if (!current(op)) return;
      catalog = data.items;
      options(catalog, baseSelect, 'Elegí la base'); $('[data-pc-query]').hidden = catalog.length === 0;
      status.textContent = catalog.length >= 2 ? 'Elegí la base y luego otra liquidación del mismo tipo.'
        : catalog.length ? 'Hay una sola liquidación disponible. Se necesitan dos del mismo tipo para comparar.' : 'No hay liquidaciones disponibles para tu ámbito.';
      if (data.truncated) status.textContent += ' Se muestran las 240 más recientes; no es el historial completo.';
    } catch (error) { failure(error, op); } finally { finish(op); }
  });
  baseSelect.addEventListener('change', () => {
    cancel(); clearResult(); const base = catalog.find(item => item.datasetId === baseSelect.value);
    const candidates = base ? catalog.filter(item => item.datasetId !== base.datasetId && item.type === base.type) : [];
    options(candidates, targetSelect, 'Elegí la comparada'); targetSelect.disabled = !candidates.length;
    $('[data-pc-selection]').textContent = base && !candidates.length ? 'No hay otra liquidación del mismo tipo en el catálogo disponible.' : 'La diferencia se calcula como comparada menos base.';
    status.textContent = 'Selección modificada. Compará las dos fuentes para actualizar el resultado.'; controls();
  });
  targetSelect.addEventListener('change', () => { cancel(); clearResult(); status.textContent = 'Selección modificada. Presioná Comparar.'; controls(); });
  $('[data-pc-query]').addEventListener('submit', async event => {
    event.preventDefault(); if (operation) return;
    const base = catalog.find(item => item.datasetId === baseSelect.value), target = catalog.find(item => item.datasetId === targetSelect.value);
    clearResult();
    if (!base || !target || base.datasetId === target.datasetId || base.type !== target.type) { status.textContent = 'Elegí dos liquidaciones distintas del mismo tipo.'; return; }
    const op = start('Consultando ambas fuentes y comparando conceptos…');
    try {
      const [a, b] = await Promise.all([request(base.datasetId, op), request(target.datasetId, op)]);
      if (!current(op)) return;
      // A stale catalog is not a license to silently switch the selected source.
      for (const [selected, fresh] of [[base, a], [target, b]]) {
        if (['payloadHash', 'date', 'type', 'closureStatus', 'statementCount', 'lineCount', 'sourceLabel'].some(key => selected[key] !== fresh[key])) {
          throw Error('El catálogo cambió. Consultá las liquidaciones nuevamente antes de comparar.');
        }
      }
      model = createPayrollComparison(a, b); showSources(); render();
      status.textContent = 'Comparación consultada. Filtrá las variaciones o revisá los totalizadores por separado.';
    } catch (error) { failure(error, op); } finally { finish(op); }
  });
  function filterChanged() {
    cancel();
    if (!model) return;
    try { render(); showSources(); status.textContent = 'Filtro actualizado. Las descargas incluirán exactamente las filas visibles del filtro.'; }
    catch (error) { clearResult(); status.textContent = error.message; }
  }
  for (const key of ['group', 'change', 'sort']) $('[data-pc-' + key + ']').addEventListener('change', filterChanged);
  $('[data-pc-search]').addEventListener('input', filterChanged);
  $('[data-pc-reset]').addEventListener('click', () => {
    $('[data-pc-group]').value = 'concepts'; $('[data-pc-change]').value = 'all'; $('[data-pc-sort]').value = 'code'; $('[data-pc-search]').value = ''; filterChanged();
  });
  for (const button of formats) button.addEventListener('click', async () => {
    if (!model || operation || !active()) return;
    const original = model, filter = filters(), op = start('Verificando acceso y versión de las dos fuentes antes de descargar…');
    try {
      const [a, b] = await Promise.all([request(original.base.datasetId, op), request(original.target.datasetId, op)]);
      if (!current(op) || model !== original) return;
      if (!comparisonSourcesUnchanged(original, a, b)) throw Error('Alguna fuente cambió. Volvé a comparar antes de descargar.');
      const filename = saveReport(comparisonDocument(original, filter), button.dataset.pcFormat);
      status.textContent = 'Archivo generado: ' + filename;
    } catch (error) { failure(error, op); } finally { finish(op); }
  });
  $('[data-pc-cancel]').addEventListener('click', () => { cancel(); status.textContent = 'Consulta cancelada. No se generó ningún archivo.'; });
  function leaveTask() {
    if (!active() && (operation || model || catalog.length)) {
      cancel(); clearResult(); resetCatalog(); $('[data-pc-login]').hidden = true;
      status.textContent = 'Volvé a consultar las fuentes para iniciar otra comparación.';
    }
  }
  document.addEventListener('taskchange', leaveTask);
  document.addEventListener('visibilitychange', leaveTask);
  window.addEventListener('pagehide', () => { cancel(); clearResult(); resetCatalog(); });
  controls();
}
