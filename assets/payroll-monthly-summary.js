import { monthlySummaryData, monthlySummaryRevision, monthlySummaryFilter, monthlyDecimal, monthlyClosure, monthlyType, monthlyObservations, sourceMonthlyPeriod, validMonthlyPeriod, MUTUAL_RETENTIONS_PRESET, mutualRetentionCandidates, mutualRetentionsView, mutualDecimal } from './payroll-monthly-summary-model.js';
import { monthlySummaryXlsx, monthlySummaryPdf, mutualRetentionsXlsx, mutualRetentionsPdf } from './payroll-monthly-summary-export.js';

const ENDPOINT = '/api/internal-payroll-monthly-source-summary';
const PAGE_SIZE = 50;
const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
function message(e) {
  if (e.status === 401) return 'La sesión venció. Ingresá nuevamente para consultar el resumen.';
  if (e.status === 403) return 'Tu perfil no tiene permiso vigente para consultar nómina.';
  const codes = {
    SESSION_BUSY: 'Hay otra consulta en curso. Esperá un momento y reintentá.',
    MIXED_PERIOD: 'Las liquidaciones corresponden a distintos períodos de imputación. Consultá las disponibles y elegí un solo período.',
    DUPLICATE_REVISION: 'La selección contiene revisiones de una misma liquidación. Elegí una sola revisión y volvé a consultar.',
    CATALOG_CONFLICT: 'Un concepto tiene definiciones distintas entre las liquidaciones. El resumen necesita revisar esas fuentes antes de combinarse.',
    SOURCE_DRIFT: 'Las fuentes cambiaron o provienen de respaldos distintos. Consultá las disponibles y elegí liquidaciones del mismo respaldo.',
    SOURCE_INCOMPLETE: 'Una liquidación tiene detalles incompletos. No se generó un resumen parcial. Revisá la fuente antes de reintentar.',
    NOT_FOUND: 'Una liquidación ya no está disponible para tu ámbito. Actualizá las liquidaciones y revisá la selección.',
    SOURCE_BINDING_REQUIRED: 'Tu ámbito todavía no tiene una fuente de nómina habilitada para esta consulta.',
    RELEASE_NOT_CERTIFIED: 'La consulta mensual todavía no está habilitada para este ámbito.',
    ROW_LIMIT: 'La consulta supera el volumen admitido. Elegí menos liquidaciones o un período; no se recortaron los resultados.',
    QUERY_INVALID: 'Revisá el período y elegí entre 1 y 24 liquidaciones antes de consultar.',
  };
  const code = e.code?.replace(/^PAYROLL_MONTHLY_SOURCE_/, '');
  if (codes[code]) return codes[code];
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return 'La consulta demoró demasiado. Reintentá.';
  if (e.status || e instanceof TypeError) return 'No se pudo conectar con el resumen. Conservamos tu selección para reintentar.';
  return e.message || 'No se pudo consultar el resumen. Reintentá.';
}
export function mountMonthlySummary(host) {
  if (!host || host.dataset.monthlyMounted) return;
  host.dataset.monthlyMounted = 'true'; host.classList.add('monthly-summary');
  host.innerHTML = `<header class="rc-panel-head"><p class="rc-eyebrow">FUENTE PROPIA · CONTROL INTERNO</p><h2>Resumen mensual</h2><p>Elegí el período de imputación y las liquidaciones que querés reunir. Consultá conceptos, cantidades e importes sin preparar archivos de entrada.</p></header>
    <p class="ms-note">El resumen reúne sólo las liquidaciones que selecciones. No certifica que estén todas las del mes, ni constituye un cierre o un pago.</p>
    <div class="rc-filter"><label>Acotar liquidaciones a un período (opcional)<input type="month" min="1900-01" max="2100-12" data-ms-catalog-period></label><button type="button" class="rc-button" data-ms-catalog>Consultar liquidaciones disponibles</button></div>
    <p role="status" aria-live="polite" class="ms-status" data-ms-status>Consultá las fuentes disponibles para empezar.</p>
    <a href="login.html?next=reportes-rrhh.html%23resumen-mensual" data-ms-login hidden>Ingresar al portal interno</a>
    <div data-ms-selection hidden><div class="rc-filter"><label>Período de imputación<select data-ms-period aria-describedby="ms-period-note"><option value="">Elegí un período</option></select></label></div>
    <p id="ms-period-note" class="ms-note">Se usa el año y mes informado en origen. La fecha de la liquidación puede pertenecer a otro mes.</p>
    <fieldset class="ms-fieldset"><legend>Liquidaciones disponibles · elegí entre 1 y 24</legend><div class="ms-sources" data-ms-sources></div></fieldset>
    <div class="ms-selection-actions"><p data-ms-selected>0 liquidaciones seleccionadas</p><button type="button" class="rc-button" data-ms-consult disabled>Consultar resumen</button><button type="button" class="rc-button secondary" data-ms-clear>Quitar selección</button></div></div>
    <section data-ms-result hidden aria-label="Resumen de las liquidaciones seleccionadas"><div class="rc-source" data-ms-scope></div>
    <div class="rc-kpis"><div><span>Liquidaciones seleccionadas</span><strong data-ms-datasets></strong></div><div><span>Participaciones en liquidaciones</span><strong data-ms-participations></strong></div><div><span>Legajos únicos de la selección</span><strong data-ms-legajos></strong></div></div>
    <p class="ms-note">Un legajo puede participar en varias liquidaciones. Las ocurrencias son líneas de un concepto; las cantidades conservan su unidad de origen. No se suman componentes y totalizadores entre sí.</p>
    <details class="ms-trace"><summary>Ver fuentes exactas y corte de la consulta</summary><p data-ms-queried></p><div data-ms-trace></div></details>
    <details class="ms-mutuals"><summary>Detalle de lo retenido a mutuales</summary>
      <p class="ms-note">Elegí los descuentos que necesitás reunir. La selección se aplica a las liquidaciones consultadas arriba y es independiente del filtro del resumen general.</p>
      <div class="ms-selection-actions"><button type="button" class="rc-button" data-mr-preset>Usar códigos de la muestra de agosto</button><button type="button" class="rc-button secondary" data-mr-clear>Quitar todos los conceptos</button></div>
      <p class="ms-note" data-mr-origin></p><p class="ms-note">La muestra es un punto de partida editable; no confirma el alcance de otro período. Los nombres e importes se leen de la fuente consultada.</p>
      <fieldset class="ms-fieldset"><legend>Conceptos para el detalle de mutuales</legend><label class="mr-search">Buscar un descuento para agregar<input type="search" maxlength="100" data-mr-search></label><div class="mr-options" data-mr-options></div></fieldset>
      <p role="status" aria-live="polite" data-mr-status>Elegí conceptos para preparar el detalle.</p>
      <div class="mr-totals"><div><span>Subtotal informado</span><strong data-mr-subtotal>No determinable</strong></div><div><span>Total de la selección</span><strong data-mr-total>No determinable</strong></div></div>
      <p class="ms-note">Si hay conceptos ausentes, importes faltantes o totalizadores, el total queda pendiente. El subtotal suma únicamente importes verificables; no se recalculan descuentos ni porcentajes.</p>
      <div class="rc-downloads"><button type="button" class="rc-button" data-mr-export="xlsx">Descargar Excel de mutuales</button><button type="button" class="rc-button secondary" data-mr-export="pdf">Descargar PDF de mutuales</button></div>
      <p class="ms-note">Ambos archivos incluyen todos los conceptos seleccionados, período y fuentes exactas. Control interno, sin firma aplicada ni acreditación de pago.</p>
      <div class="rc-table-wrap mr-table" tabindex="0" role="region" aria-label="Retenciones a mutuales, desplazable"><table class="rc-table"><thead><tr><th scope="col">Código / concepto</th><th scope="col">Importe retenido</th><th scope="col">Estado</th></tr></thead><tbody data-mr-rows></tbody></table></div>
    </details>
    <div class="rc-filter"><label>Buscar código o concepto<input type="search" maxlength="100" data-ms-search></label><label>Datos del concepto<select data-ms-filter><option value="all">Todos</option><option value="missing">Con datos faltantes</option><option value="informed">Sin faltantes en las líneas incluidas</option></select></label></div>
    <p class="ms-note">Si falta un importe o cantidad en alguna línea, su suma figura como “No informado”. Un concepto ausente no equivale a cero.</p>
    <div class="rc-downloads"><button type="button" class="rc-button" data-ms-export="pdf">Descargar PDF</button><button type="button" class="rc-button secondary" data-ms-export="xlsx">Descargar Excel</button></div>
    <p data-ms-range></p><div class="rc-table-wrap ms-table" tabindex="0" role="region" aria-label="Conceptos del resumen, desplazable"><table class="rc-table"><caption class="ms-sr">Conceptos de las liquidaciones seleccionadas</caption><thead><tr><th scope="col">Código / concepto</th><th scope="col">Unidad</th><th scope="col">Ocurrencias</th><th scope="col">Legajos únicos</th><th scope="col">Cantidad</th><th scope="col">Importe</th><th scope="col">Observaciones</th></tr></thead><tbody data-ms-rows></tbody></table></div>
    <div class="ms-pagination"><button type="button" class="rc-button secondary" data-ms-previous>Anterior</button><p data-ms-page></p><button type="button" class="rc-button secondary" data-ms-next>Siguiente</button></div></section>`;
  const $ = s => host.querySelector(s), status = $('[data-ms-status]'), result = $('[data-ms-result]');
  let catalog = null, data = null, queriedAt = null, busy = false, generation = 0, controller = null, page = 1, suspended = false;
  let mutualCodes = [], mutualChoiceData = null, mutualError = false;
  $('[data-mr-origin]').textContent = MUTUAL_RETENTIONS_PRESET.source + ' · Códigos: ' + MUTUAL_RETENTIONS_PRESET.codes.join(', ') + '.';
  const available = () => !suspended && host.isConnected && !host.closest('[hidden]') && document.visibilityState !== 'hidden';
  const selectedIds = () => [...host.querySelectorAll('[data-ms-id]:checked')].map(n => n.value).sort();
  const view = () => monthlySummaryFilter(data, { search: $('[data-ms-search]').value, status: $('[data-ms-filter]').value });
  function controls() {
    host.setAttribute('aria-busy', String(busy)); $('[data-ms-catalog]').disabled = busy;
    const selected = selectedIds().length; $('[data-ms-selected]').textContent = selected + ' liquidaciones seleccionadas';
    $('[data-ms-consult]').disabled = busy || !selected || selected > 24;
    host.querySelectorAll('[data-ms-export]').forEach(b => b.disabled = busy || !data || !view().rows.length);
    host.querySelectorAll('[data-mr-export]').forEach(b => b.disabled = busy || !data || mutualError || !mutualCodes.length);
    $('[data-ms-previous]').disabled = busy || !data || page <= 1;
    $('[data-ms-next]').disabled = busy || !data || page * PAGE_SIZE >= view().rows.length;
  }
  function clearResult() { data = null; queriedAt = null; mutualChoiceData = null; result.hidden = true; $('[data-ms-rows]').replaceChildren(); $('[data-ms-trace]').replaceChildren(); $('[data-mr-options]').replaceChildren(); $('[data-mr-rows]').replaceChildren(); $('[data-mr-status]').textContent = 'Consultá nuevamente el resumen para preparar el detalle.'; $('[data-mr-subtotal]').textContent = 'No determinable'; $('[data-mr-total]').textContent = 'No determinable'; }
  function cancel() { generation++; controller?.abort(); controller = null; busy = false; }
  function start() { cancel(); controller = new AbortController(); busy = true; controls(); return { seq: generation, controller }; }
  const valid = job => job.seq === generation && !job.controller.signal.aborted && available();
  async function read(resource, job, period = null, datasetIds = []) {
    const query = new URLSearchParams({ resource }); if (period) query.set('period', period); if (resource === 'summary') query.set('datasetIds', datasetIds.join(','));
    const response = await fetch(ENDPOINT + '?' + query, { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.any([job.controller.signal, AbortSignal.timeout(30000)]) });
    if (!response.ok) { let code = ''; try { code = (await response.json()).code; } catch { /* Never show server text. */ } throw Object.assign(Error(), { status: response.status, code }); }
    return monthlySummaryData(await response.json(), { resource, period, datasetIds });
  }
  function failure(e) {
    clearResult(); status.textContent = message(e); $('[data-ms-login]').hidden = e.status !== 401;
    if ([401, 403].includes(e.status)) { catalog = null; $('[data-ms-selection]').hidden = true; $('[data-ms-sources]').replaceChildren(); }
  }
  function sources() {
    const period = $('[data-ms-period]').value, list = catalog?.items.filter(s => sourceMonthlyPeriod(s) === period) || [];
    const pairs = new Map(); for (const s of list) { const k = s.date + ':' + s.type; pairs.set(k, (pairs.get(k) || 0) + 1); }
    $('[data-ms-sources]').replaceChildren(...list.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type) || a.importedAt.localeCompare(b.importedAt)).map(s => {
      const card = node('label', undefined, 'ms-source-card'), check = node('input'), detail = node('span'); check.type = 'checkbox'; check.value = s.datasetId; check.dataset.msId = '';
      detail.append(node('strong', s.date + ' · ' + monthlyType(s.type)), node('span', monthlyClosure(s.closureStatus), 'ms-badge ' + s.closureStatus),
        node('small', s.statementCount.toLocaleString('es-AR') + ' legajos · ' + s.sourceLabel), node('small', 'Incorporada: ' + new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Mendoza', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(s.importedAt))));
      if (pairs.get(s.date + ':' + s.type) > 1) detail.append(node('small', 'Hay revisiones disponibles: elegí una sola.', 'ms-warning'));
      card.append(check, detail); return card;
    }));
    if (!list.length) $('[data-ms-sources]').append(node('p', period ? 'No hay liquidaciones disponibles para este período.' : 'Elegí el período para ver sus liquidaciones.'));
    controls();
  }
  async function consultCatalog() {
    if (busy || !available()) return;
    const period = $('[data-ms-catalog-period]').value || null;
    if (period !== null && !validMonthlyPeriod(period)) { status.textContent = 'Elegí un período válido entre 1900-01 y 2100-12.'; return; }
    const job = start(); clearResult(); catalog = null; $('[data-ms-selection]').hidden = true; $('[data-ms-login]').hidden = true;
    status.textContent = 'Consultando liquidaciones disponibles…';
    try { const next = await read('catalog', job, period); if (!valid(job)) return; catalog = next;
      const blank = node('option', 'Elegí un período'); blank.value = '';
      $('[data-ms-period]').replaceChildren(blank, ...[...new Set(next.items.map(sourceMonthlyPeriod))].sort().reverse().map(p => { const o = node('option', p); o.value = p; return o; }));
      $('[data-ms-selection]').hidden = false; sources();
      status.textContent = next.total ? next.total + ' liquidaciones disponibles. Elegí período y liquidaciones; no se selecciona ninguna automáticamente.' : 'No hay liquidaciones incorporadas disponibles para tu ámbito.';
    } catch (e) { if (valid(job)) failure(e); } finally { if (job.seq === generation) { busy = false; controls(); } }
  }
  function render() {
    const filtered = view(), pages = Math.max(1, Math.ceil(filtered.rows.length / PAGE_SIZE)); page = Math.min(page, pages);
    $('[data-ms-datasets]').textContent = data.counts.datasetCount;
    $('[data-ms-participations]').textContent = data.counts.statementParticipations.toLocaleString('es-AR');
    $('[data-ms-legajos]').textContent = data.counts.distinctLegajos.toLocaleString('es-AR');
    $('[data-ms-scope]').textContent = 'Imputación ' + data.period + ' · General de las liquidaciones seleccionadas. No certifica el mes completo. ' + data.counts.lineCount.toLocaleString('es-AR') + ' líneas de origen.';
    $('[data-ms-queried]').textContent = 'Consulta: ' + queriedAt + ' · SHA-256 del resumen: ' + data.reportHash;
    $('[data-ms-trace]').replaceChildren(...data.sources.map(s => { const p = node('p'); p.append(node('strong', s.sourceLabel + ' · ' + s.date + ' · ' + monthlyType(s.type) + ' · ' + monthlyClosure(s.closureStatus)),
      node('small', 'ID: ' + s.datasetId + ' · Incorporación: ' + s.importedAt), node('small', 'Respaldo: ' + s.sourceSha256), node('small', 'Contenido: ' + s.payloadHash)); return p; }));
    $('[data-ms-range]').textContent = filtered.rows.length + ' de ' + data.rows.length + ' conceptos · PDF y Excel incluyen todo el filtro.';
    $('[data-ms-page]').textContent = filtered.rows.length ? 'Página ' + page + ' de ' + pages + ' · hasta 50 conceptos por página' : 'Sin conceptos para este filtro';
    const rows = filtered.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(r => {
      const tr = node('tr'), name = node('th'); name.scope = 'row'; name.append(node('strong', r.code), node('span', r.description)); tr.append(name);
      [r.unit || 'No informada', r.sourceRows.toLocaleString('es-AR'), r.distinctLegajos.toLocaleString('es-AR'), monthlyDecimal(r.quantity), monthlyDecimal(r.amount), monthlyObservations(r)].forEach((v, i) => tr.append(node('td', v, i >= 1 && i <= 4 ? 'ms-number' : ''))); return tr;
    });
    if (!rows.length) { const tr = node('tr'), td = node('td', 'No hay conceptos para este filtro. Cambiá la búsqueda o el estado.'); td.colSpan = 7; tr.append(td); rows.push(tr); }
    $('[data-ms-rows]').replaceChildren(...rows); renderMutuals(); result.hidden = false; controls();
  }
  function filterMutualOptions() {
    const fold = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const query = fold($('[data-mr-search]').value.trim());
    host.querySelectorAll('[data-mr-option]').forEach(label => { label.hidden = !fold(label.textContent).includes(query); });
  }
  function renderMutuals() {
    if (!data) return;
    try { renderMutualSelection(); mutualError = false; }
    catch (error) {
      mutualError = true; mutualChoiceData = null;
      $('[data-mr-options]').replaceChildren(); $('[data-mr-rows]').replaceChildren();
      $('[data-mr-subtotal]').textContent = 'No determinable'; $('[data-mr-total]').textContent = 'No determinable';
      $('[data-mr-status]').textContent = message(error) + ' El resumen general sigue disponible; revisá los códigos en la fuente antes de preparar mutuales.';
    }
  }
  function renderMutualSelection() {
    const report = mutualRetentionsView(data, mutualCodes);
    mutualCodes = [...report.codes];
    if (mutualChoiceData !== data) {
      const indexed = new Map(data.rows.map(row => [Number(row.code), row]));
      const candidates = new Map(mutualRetentionCandidates(data).map(r => [Number(r.code), { code: r.code, row: r }]));
      for (const code of [...MUTUAL_RETENTIONS_PRESET.codes, ...mutualCodes]) if (!candidates.has(Number(code))) {
        const row = indexed.get(Number(code)); candidates.set(Number(code), { code: row?.code ?? code, row });
      }
      $('[data-mr-options]').replaceChildren(...[...candidates].sort(([a], [b]) => a - b).map(([, { code, row }]) => {
        const label = node('label', undefined, 'mr-option'), input = node('input'), name = node('span'); label.dataset.mrOption = ''; input.type = 'checkbox'; input.value = code; input.dataset.mrCode = '';
        name.append(node('strong', code), node('span', row?.description || 'Sin líneas en esta selección')); label.append(input, name); return label;
      }));
      mutualChoiceData = data;
    }
    host.querySelectorAll('[data-mr-code]').forEach(input => { input.checked = mutualCodes.includes(input.value); });
    filterMutualOptions();
    $('[data-mr-status]').textContent = report.rows.length ? report.rows.length + ' conceptos seleccionados · ' + report.informedCount + ' con importe sumable · ' + report.absentCount + ' ausentes · ' + report.missingCount + ' con importe faltante · ' + report.unverifiedCount + ' no sumables.' : 'Elegí conceptos o usá la preconfiguración de la muestra.';
    $('[data-mr-subtotal]').textContent = mutualDecimal(report.subtotal); $('[data-mr-total]').textContent = mutualDecimal(report.total);
    $('[data-mr-rows]').replaceChildren(...report.rows.map(row => {
      const tr = node('tr'), name = node('th'); name.scope = 'row'; name.append(node('strong', row.code), node('span', row.description));
      tr.append(name, node('td', mutualDecimal(row.amount), 'ms-number'), node('td', row.observation)); return tr;
    }));
  }
  function mutualSelectionChanged(codes) { cancel(); mutualCodes = codes; if (data) renderMutuals(); controls(); status.textContent = 'Selección de mutuales actualizada. La descarga vuelve a verificar las fuentes.'; }
  $('[data-mr-preset]').addEventListener('click', () => mutualSelectionChanged([...MUTUAL_RETENTIONS_PRESET.codes]));
  $('[data-mr-clear]').addEventListener('click', () => mutualSelectionChanged([]));
  $('[data-mr-options]').addEventListener('change', event => { if (event.target.matches('[data-mr-code]')) mutualSelectionChanged([...host.querySelectorAll('[data-mr-code]:checked')].map(input => input.value)); });
  $('[data-mr-search]').addEventListener('input', () => { filterMutualOptions(); $('[data-mr-options]').scrollTop = 0; });
  async function consultSummary() {
    if (busy || !available() || !selectedIds().length) return;
    const ids = selectedIds(), period = $('[data-ms-period]').value, job = start(); clearResult(); status.textContent = 'Reuniendo las liquidaciones seleccionadas…';
    try { const next = await read('summary', job, period, ids); if (!valid(job)) return;
      data = next; queriedAt = new Date().toISOString(); page = 1; render(); status.textContent = 'Resumen consultado. Filtrá conceptos y descargá el mismo resultado.';
    } catch (e) { if (valid(job)) failure(e); } finally { if (job.seq === generation) { busy = false; controls(); } }
  }
  function selectionChanged() { cancel(); clearResult(); controls(); status.textContent = 'Selección modificada. Consultá el resumen antes de descargar.'; }
  $('[data-ms-catalog]').addEventListener('click', consultCatalog); $('[data-ms-consult]').addEventListener('click', consultSummary);
  $('[data-ms-catalog-period]').addEventListener('input', () => { selectionChanged(); catalog = null; $('[data-ms-selection]').hidden = true; $('[data-ms-sources]').replaceChildren(); controls(); status.textContent = 'Período de búsqueda modificado. Consultá las liquidaciones disponibles.'; });
  $('[data-ms-period]').addEventListener('change', () => { selectionChanged(); sources(); });
  $('[data-ms-sources]').addEventListener('change', e => {
    if (!e.target.matches('[data-ms-id]')) return;
    if (selectedIds().length > 24) { e.target.checked = false; status.textContent = 'Podés seleccionar hasta 24 liquidaciones.'; return; }
    selectionChanged();
  });
  $('[data-ms-clear]').addEventListener('click', () => { host.querySelectorAll('[data-ms-id]').forEach(n => n.checked = false); selectionChanged(); });
  for (const attr of ['search', 'filter']) $('[data-ms-' + attr + ']').addEventListener('input', () => { if (!data) return; cancel(); page = 1; render(); status.textContent = 'Filtro aplicado al resumen y a las descargas.'; });
  $('[data-ms-previous]').addEventListener('click', () => { if (data && !busy) { page--; render(); } });
  $('[data-ms-next]').addEventListener('click', () => { if (data && !busy) { page++; render(); } });
  host.querySelectorAll('[data-ms-export]').forEach(b => b.addEventListener('click', async () => {
    if (busy || !data || !available()) return;
    const original = data, filtered = view(), when = queriedAt, job = start(); status.textContent = 'Verificando acceso, selección y fuentes antes de descargar…';
    try { const fresh = await read('summary', job, original.period, original.sources.map(s => s.datasetId)); if (!valid(job)) return;
      if (monthlySummaryRevision(fresh) !== monthlySummaryRevision(original)) throw Error('Cambió el resumen o alguna fuente, incluido su cierre. Volvé a consultar antes de descargar.');
      const format = b.dataset.msExport, bytes = format === 'pdf' ? monthlySummaryPdf(original, filtered, when) : monthlySummaryXlsx(original, filtered, when);
      if (!valid(job)) return;
      const url = URL.createObjectURL(new Blob([bytes], { type: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })), a = node('a');
      a.href = url; a.download = 'municontrol_resumen-mensual_' + original.period + '.' + format; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
      status.textContent = (format === 'pdf' ? 'PDF' : 'Excel') + ' generado: ' + filtered.rows.length + ' conceptos del filtro y sus fuentes. Uso interno.';
    } catch (e) { if (valid(job)) { if (e.exportOnly) status.textContent = message(e); else failure(e); } } finally { if (job.seq === generation) { busy = false; controls(); } }
  }));
  host.querySelectorAll('[data-mr-export]').forEach(button => button.addEventListener('click', async () => {
    if (busy || !data || mutualError || !mutualCodes.length || !available()) return;
    const original = data, report = mutualRetentionsView(data, mutualCodes), when = queriedAt, job = start();
    status.textContent = 'Verificando acceso y fuentes para el detalle de mutuales…';
    try {
      const fresh = await read('summary', job, original.period, original.sources.map(source => source.datasetId)); if (!valid(job)) return;
      if (monthlySummaryRevision(fresh) !== monthlySummaryRevision(original)) throw Error('Cambió el resumen o alguna fuente, incluido su cierre. Volvé a consultar antes de descargar.');
      const format = button.dataset.mrExport, bytes = format === 'pdf' ? mutualRetentionsPdf(original, report, when) : mutualRetentionsXlsx(original, report, when);
      if (!valid(job)) return;
      const url = URL.createObjectURL(new Blob([bytes], { type: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })), link = node('a');
      link.href = url; link.download = 'municontrol_mutuales_' + original.period + '.' + format; link.rel = 'noopener'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
      status.textContent = (format === 'pdf' ? 'PDF' : 'Excel') + ' de mutuales generado: ' + report.rows.length + ' conceptos seleccionados. ' + (report.total === null ? 'Total pendiente; revisá las observaciones.' : 'Total de la selección: ' + mutualDecimal(report.total) + '.');
    } catch (error) { if (valid(job)) { if (error.exportOnly) status.textContent = message(error); else failure(error); } }
    finally { if (job.seq === generation) { busy = false; controls(); } }
  }));
  function hidden() { if (available()) return; cancel(); clearResult(); controls(); status.textContent = 'Consultá nuevamente el resumen para continuar.'; }
  document.addEventListener('taskchange', hidden); document.addEventListener('visibilitychange', hidden);
  // Scope changes must discard a snapshot even when no request is in flight.
  document.addEventListener('municontrol:capabilities-ready', () => { if (!catalog && !data && !busy) return; cancel(); clearResult(); catalog = null; $('[data-ms-selection]').hidden = true; $('[data-ms-sources]').replaceChildren(); controls(); status.textContent = 'El acceso se actualizó. Consultá nuevamente las liquidaciones disponibles.'; });
  window.addEventListener('pagehide', () => { suspended = true; hidden(); });
  window.addEventListener('pageshow', e => { if (e.persisted) { suspended = false; cancel(); clearResult(); catalog = null; $('[data-ms-selection]').hidden = true; $('[data-ms-sources]').replaceChildren(); controls(); } });
  controls(); return { consultCatalog, consultSummary };
}
