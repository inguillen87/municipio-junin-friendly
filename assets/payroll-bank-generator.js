import { bankReportData, bankReportFilter, bankReportRevision, bankNames, bankMoney, bankAccountLabel, bankObservations } from './payroll-bank-generator-model.js';
import { bankReportXlsx, bankReportPdf } from './payroll-bank-generator-export.js';
import { monthlyType } from './payroll-monthly-summary-model.js';
import {bankReportReconciliation,bankControlNotes,assertBankReportUnchanged} from './payroll-bank-reconciliation.js';
import {bankControlPackage} from './payroll-bank-control-package.js';
import {renderBankReview} from './payroll-bank-review-panel.js';

const API = '/api/internal-payroll-bank-report';
const PAGE_SIZE = 50;
const node = (tag, text, cls) => { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; if (cls) value.className = cls; return value; };
const shown = value => value === null || value === '' ? 'No informado' : String(value);
function errorText(error) {
  if (error.status === 401) return 'La sesión venció. Ingresá nuevamente para consultar la planilla.';
  if (error.status === 403) return 'Tu perfil necesita permisos vigentes para consultar nómina y legajos.';
  if (error.code?.endsWith('BANK_SOURCE_REQUIRED')) return 'La fuente bancaria de esta liquidación todavía no está incorporada. Elegí otra liquidación o reintentá cuando esté disponible.';
  if (error.code?.endsWith('SOURCE_BINDING_REQUIRED')) return 'Tu ámbito todavía no tiene una fuente de nómina habilitada para esta consulta.';
  if (error.code === 'SOURCE_CHANGED') return 'La fuente cambió desde la consulta. Volvé a generar la planilla antes de descargar.';
  if (error.status === 404) return 'La liquidación ya no está disponible para tu ámbito. Actualizá las liquidaciones.';
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'La consulta demoró demasiado. Conservamos la selección para reintentar.';
  return error.status || error instanceof TypeError ? 'No pudimos consultar el servicio. Conservamos la selección para reintentar.' : error.message;
}
export function mountPayrollBankGenerator(host) {
  if (!host || host.dataset.bankGeneratorMounted) return;
  host.dataset.bankGeneratorMounted = 'true'; host.classList.add('payroll-bank-generator');
  host.innerHTML = `<header class="rc-panel-head"><p class="rc-eyebrow">LIQUIDACIONES INCORPORADAS · CONTROL INTERNO</p><h2>Planilla bancaria</h2><p>Elegí una liquidación, revisá sus cuentas e importes y descargá la planilla desde los datos disponibles en MuniControl.</p></header>
    <form class="rc-filter pbg-selection" data-pbg-query><label>Liquidación<select data-pbg-dataset required><option value="">Consultando liquidaciones disponibles…</option></select></label><button class="rc-button" type="submit" data-pbg-consult disabled>Generar planilla</button><button class="rc-button secondary" type="button" data-pbg-catalog>Actualizar liquidaciones</button></form>
    <p role="status" aria-live="polite" class="pbg-status" data-pbg-status>Consultá las liquidaciones incorporadas para empezar.</p><a data-pbg-login href="login.html?next=reportes-rrhh.html%23planilla-bancaria" hidden>Ingresar al portal interno</a>
    <p class="pbg-note">Excel y PDF son documentos de control. No ordenan transferencias ni acreditan pagos. El archivo de pago para el banco requiere un formato homologado.</p>
    <section data-pbg-result hidden aria-label="Planilla bancaria de la liquidación seleccionada"><div class="rc-source" data-pbg-source></div>
      <div class="pbg-source-grid"><p><span>Período de imputación</span><strong data-pbg-period></strong></p><p><span>Fecha de liquidación</span><strong data-pbg-date></strong></p><p><span>Corte de cuentas bancarias</span><strong data-pbg-cutoff></strong><small>Fecha y hora declaradas en origen, sin zona horaria informada.</small></p></div>
      <div class="rc-filter pbg-filters"><label>Banco<select data-pbg-bank><option value="all">Todos los bancos</option><option value="credicoop">Credicoop</option><option value="santander">Santander</option><option value="nacion">Nación</option><option value="unknown">Sin identificar</option></select></label><label>Jurisdicción<select data-pbg-jurisdiction><option value="all">Todas</option></select></label><label>Tipo de cuenta<select data-pbg-account><option value="all">Todos los tipos</option><option value="caja_ahorro">Caja de ahorro verificada</option><option value="cuenta_corriente">Cuenta corriente verificada</option><option value="unknown">Tipo sin verificar</option></select></label><label>Control<select data-pbg-issues><option value="all">Todas las filas</option><option value="observed">Con observaciones</option><option value="informed">Sin observaciones informadas</option></select></label><label>Buscar persona o repartición<input type="search" data-pbg-search maxlength="100" placeholder="Legajo, nombre, CUIL o repartición"></label></div>
      <p class="pbg-note" data-pbg-account-note>Los tipos sin verificar conservan el código original. La cuenta no se reconstruye ni se completa manualmente.</p>
      <div class="rc-kpis"><div><span>Filas del filtro</span><strong data-pbg-count></strong></div><div><span>Neto del filtro</span><strong data-pbg-total></strong><small data-pbg-missing></small></div><div><span>Con observaciones</span><strong data-pbg-observed></strong></div></div>
      <section data-pbg-reconcile class="pbg-reconcile" aria-label="Conciliación de la liquidación completa"></section>
      <div class="rc-downloads"><button type="button" class="rc-button" data-pbg-export="package">Descargar paquete de control</button><button type="button" class="rc-button secondary" data-pbg-export="xlsx">Descargar Excel de control</button><button type="button" class="rc-button secondary" data-pbg-export="pdf">Descargar PDF</button></div>
      <p data-pbg-range></p><div class="rc-table-wrap pbg-table" tabindex="0" role="region" aria-label="Personas y cuentas bancarias, desplazable"><table class="rc-table"><caption class="pbg-sr">Detalle de todas las filas de la liquidación disponibles para filtrar</caption><thead><tr><th scope="col">Legajo / persona</th><th scope="col">CUIL</th><th scope="col">Banco / cuenta</th><th scope="col">CBU</th><th scope="col">Jurisdicción / repartición</th><th scope="col">Neto en origen</th><th scope="col">Observaciones</th></tr></thead><tbody data-pbg-rows></tbody></table></div>
      <div class="pbg-pagination"><button class="rc-button secondary" data-pbg-prev type="button">Anterior</button><p data-pbg-page></p><button class="rc-button secondary" data-pbg-next type="button">Siguiente</button></div>
      <details class="pbg-trace"><summary>Ver fuentes exactas y alcance</summary><p data-pbg-trace></p><p>El neto corresponde al dato de la liquidación. La jurisdicción corresponde al historial disponible para esa corrida; un dato ausente no se completa con el reparto actual.</p><p>Las observaciones se conservan en ambas descargas. No se excluyen cuentas incompletas ni se consideran pagos aprobados.</p></details>
    </section>`;
  const $ = selector => host.querySelector(selector), status = $('[data-pbg-status]'), result = $('[data-pbg-result]');
  let catalog = null, data = null, reconciliation = null, busy = false, generation = 0, controller = null, page = 1, when = null, suspended = false;
  const available = () => !suspended && host.isConnected && !host.closest('[hidden]') && document.visibilityState !== 'hidden';
  const filters = () => ({ bank: $('[data-pbg-bank]').value, jurisdiction: $('[data-pbg-jurisdiction]').value, account: $('[data-pbg-account]').value, issues: $('[data-pbg-issues]').value, search: $('[data-pbg-search]').value });
  const view = () => bankReportFilter(data, filters());
  function controls() {
    host.setAttribute('aria-busy', String(busy)); $('[data-pbg-catalog]').disabled = busy;
    $('[data-pbg-consult]').disabled = busy || !catalog || !$('[data-pbg-dataset]').value;
    $('[data-pbg-dataset]').disabled = busy || !catalog;
    host.querySelectorAll('[data-pbg-export]').forEach(button => { button.disabled = busy || !data || !view().rows.length; });
    $('[data-pbg-prev]').disabled = busy || !data || page <= 1;
    $('[data-pbg-next]').disabled = busy || !data || page >= Math.ceil(view().rows.length / PAGE_SIZE);
  }
  function cancel() { generation++; controller?.abort(); controller = null; busy = false; }
  function clearResult() { data = null; reconciliation=null; when = null; result.hidden = true; $('[data-pbg-rows]').replaceChildren(); $('[data-pbg-reconcile]').replaceChildren(); for(const key of ['trace','source','period','date','cutoff','count','total','missing','observed','range','page'])$('[data-pbg-'+key+']').textContent=''; }
  function start() { cancel(); busy = true; controller = new AbortController(); controls(); return { seq: generation, signal: controller.signal }; }
  const valid = job => job.seq === generation && available();
  async function read(resource, job, datasetId) {
    const query = new URLSearchParams({ resource }); if (datasetId) query.set('datasetId', datasetId);
    const response = await fetch(API + '?' + query, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.any([job.signal, AbortSignal.timeout(30000)]) });
    if (response.status === 401 || response.status === 403) throw Object.assign(Error('Acceso no vigente'), { status: response.status });
    let payload; try { payload = await response.json(); } catch (_) { throw Error('El servicio no devolvió una respuesta válida. Reintentá.'); }
    if (!response.ok || payload.ok !== true) throw Object.assign(Error('Consulta rechazada'), { status: response.status, code: String(payload.code || '') });
    return bankReportData(payload, { resource, datasetId });
  }
  function failure(error, preserve = false) {
    if (!preserve || error.status === 401 || error.status === 403 || error.code === 'SOURCE_CHANGED') clearResult();
    if (error.status === 401 || error.status === 403) { catalog = null; $('[data-pbg-dataset]').replaceChildren(new Option('Acceso no disponible', '')); $('[data-pbg-login]').hidden = error.status !== 401; }
    status.textContent = errorText(error); status.dataset.error = 'true'; controls();
  }
  async function consultCatalog() {
    if (busy || !available()) return;
    const previous = $('[data-pbg-dataset]').value, job = start(); clearResult(); status.dataset.error = ''; status.textContent = 'Consultando liquidaciones incorporadas…'; $('[data-pbg-login]').hidden = true;
    try {
      const next = await read('catalog', job); if (!valid(job)) return; catalog = next;
      $('[data-pbg-dataset]').replaceChildren(new Option('Elegí una liquidación', ''), ...next.items.map(item => new Option(item.period + ' · ' + monthlyType(item.type) + ' · fecha ' + item.date + ' · ' + item.statementCount + ' legajos' + (item.bankSourceAvailable ? '' : ' · fuente bancaria pendiente'), item.datasetId)));
      if (next.items.some(item => item.datasetId === previous)) $('[data-pbg-dataset]').value = previous;
      status.textContent = next.items.length ? next.items.length + ' liquidaciones disponibles. Elegí una para generar su planilla.' : 'No hay liquidaciones incorporadas disponibles para tu ámbito.';
    } catch (error) { if (valid(job)) failure(error); } finally { if (job.seq === generation) { busy = false; controls(); } }
  }
  function accountOptions() {
    const bank = $('[data-pbg-bank]').value, previous = $('[data-pbg-account]').value;
    const known = new Set((data?.rows || []).filter(row => bank === 'all' || row.bankKey === bank).map(row => row.accountType));
    const options = [new Option('Todos los tipos', 'all')];
    if (known.has('caja_ahorro')) options.push(new Option('Caja de ahorro verificada', 'caja_ahorro'));
    if (known.has('cuenta_corriente') && !['santander', 'nacion'].includes(bank)) options.push(new Option('Cuenta corriente verificada', 'cuenta_corriente'));
    options.push(new Option('Tipo sin verificar', 'unknown'));
    $('[data-pbg-account]').replaceChildren(...options);
    $('[data-pbg-account]').value = options.some(option => option.value === previous) ? previous : 'all';
    const unknown = data?.rows.filter(row => row.accountType === null).length || 0;
    $('[data-pbg-account-note]').textContent = unknown ? unknown + ' filas conservan un código de tipo de cuenta cuyo significado todavía no fue verificado. No se presume caja de ahorro ni cuenta corriente.' : 'Los filtros por tipo usan únicamente correspondencias verificadas en la fuente. Las cuentas no se completan manualmente.';
  }
  function render() {
    const selected = view(), pages = Math.max(1, Math.ceil(selected.rows.length / PAGE_SIZE)); page = Math.min(page, pages);
    $('[data-pbg-source]').textContent = data.dataset.sourceLabel + ' · ' + monthlyType(data.dataset.type) + ' · ' + data.rows.length + ' filas disponibles en esta liquidación.';
    $('[data-pbg-period]').textContent = data.dataset.period; $('[data-pbg-date]').textContent = data.dataset.date; $('[data-pbg-cutoff]').textContent = data.bankSource.cutoff.replace('T', ' ');
    $('[data-pbg-count]').textContent = selected.rows.length + ' / ' + data.rows.length;
    $('[data-pbg-total]').textContent = selected.total === null ? 'No evaluable' : bankMoney(selected.total);
    $('[data-pbg-missing]').textContent = selected.missingAmounts ? selected.missingAmounts + ' netos ausentes. Suma informada: ' + bankMoney(selected.knownTotal) : 'Suma exacta de los netos del filtro.';
    $('[data-pbg-observed]').textContent = String(selected.observed);
    $('[data-pbg-range]').textContent = selected.rows.length + ' filas del filtro. Excel y PDF incluyen todas, aunque la tabla muestre hasta 50 por página.';
    $('[data-pbg-page]').textContent = selected.rows.length ? 'Página ' + page + ' de ' + pages : 'Sin filas para este filtro';
    $('[data-pbg-trace]').textContent = 'Consulta: ' + when + '\nLiquidación: ' + data.dataset.datasetId + '\nNómina SHA-256: ' + data.dataset.sourceSha256 + '\nContenido nómina: ' + data.dataset.payloadHash + '\nFuente bancaria SHA-256: ' + data.bankSource.sourceSha256 + '\nContenido bancario: ' + data.bankSource.payloadSha256 + '\nReporte SHA-256: ' + data.reportHash;
    const rows = selected.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(row => {
      const tr = node('tr'), identity = node('th'); identity.scope = 'row'; identity.append(node('strong', shown(row.legajo)), node('span', shown(row.name))); tr.append(identity, node('td', shown(row.cuil), 'pbg-code'));
      const account = node('td'); account.append(node('strong', shown(row.bankLabel)), node('span', bankAccountLabel(row)), node('span', 'Cuenta ' + shown(row.accountNumber), 'pbg-code')); tr.append(account, node('td', shown(row.cbu), 'pbg-code'));
      tr.append(node('td', shown(row.jurisdiction) + ' · ' + shown(row.repartitionCode) + ' · ' + shown(row.repartitionLabel)), node('td', bankMoney(row.netAmount), 'pbg-money'), node('td', [bankObservations(row),bankControlNotes(reconciliation,row)].filter(Boolean).join(' · '))); return tr;
    });
    if (!rows.length) { const tr = node('tr'), td = node('td', 'No hay filas para este filtro. Cambiá banco, jurisdicción, tipo o búsqueda.'); td.colSpan = 7; tr.append(td); rows.push(tr); }
    $('[data-pbg-rows]').replaceChildren(...rows); result.hidden = false; controls();
  }
  async function consultReport() {
    if (busy || !available() || !$('[data-pbg-dataset]').value) return;
    const id = $('[data-pbg-dataset]').value, job = start(); clearResult(); status.dataset.error = ''; status.textContent = 'Reuniendo netos y datos bancarios de la liquidación…';
    try {
      const next = await read('report', job, id); if (!valid(job)) return; data = next; when = new Date().toISOString(); page = 1;
      const old = $('[data-pbg-jurisdiction]').value, choices = [...new Set(data.rows.map(row => row.jurisdiction).filter(value => value !== null))].sort();
      $('[data-pbg-jurisdiction]').replaceChildren(new Option('Todas', 'all'), ...choices.map(value => new Option('Jurisdicción ' + value, value)), new Option('No informada', 'unknown'));
      if (choices.includes(old) || old === 'unknown') $('[data-pbg-jurisdiction]').value = old;
      reconciliation=bankReportReconciliation(data);renderBankReview($('[data-pbg-reconcile]'),reconciliation);
      accountOptions(); render(); status.textContent = 'Planilla generada desde la fuente. Revisá las observaciones y descargá el resultado del filtro.';
    } catch (error) { if (valid(job)) failure(error); } finally { if (job.seq === generation) { busy = false; controls(); } }
  }
  $('[data-pbg-catalog]').addEventListener('click', consultCatalog);
  $('[data-pbg-query]').addEventListener('submit', event => { event.preventDefault(); consultReport(); });
  $('[data-pbg-dataset]').addEventListener('change', () => { cancel(); clearResult(); controls(); status.textContent = 'Liquidación seleccionada. Generá su planilla para revisar y descargar.'; });
  host.querySelectorAll('.pbg-filters select,.pbg-filters input').forEach(input => input.addEventListener('input', () => {
    if (input === $('[data-pbg-bank]')) accountOptions();
    if (!data) return; cancel(); page = 1; render(); status.textContent = 'Filtro aplicado a la tabla y a las descargas.';
  }));
  $('[data-pbg-prev]').addEventListener('click', () => { if (!busy && data && page > 1) { page--; render(); } });
  $('[data-pbg-next]').addEventListener('click', () => { if (!busy && data && page * PAGE_SIZE < view().rows.length) { page++; render(); } });
  host.querySelectorAll('[data-pbg-export]').forEach(button => button.addEventListener('click', async () => {
    if (busy || !data || !available() || !view().rows.length) return;
    const original = data, selected = view(), queried = when, job = start(); status.dataset.error = ''; status.textContent = 'Verificando permiso y fuente antes de descargar…';
    try {
      const fresh = await read('report', job, original.dataset.datasetId); if (!valid(job)) return;
      assertBankReportUnchanged(original,fresh);
      const format = button.dataset.pbgExport;
      const bundle = format==='package' ? await bankControlPackage(original,selected,queried,{signal:job.signal}) : null;
      const bytes = bundle ? bundle.bytes : format === 'pdf' ? bankReportPdf(original, selected, queried) : bankReportXlsx(original, selected, queried);
      if (!valid(job)) return;
      const url = URL.createObjectURL(new Blob([bytes], { type: bundle ? 'application/zip' : format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })), a = node('a');
      a.href = url; a.download = bundle ? bundle.filename : 'municontrol_planilla-bancaria_' + original.dataset.period + '_' + original.dataset.datasetId.slice(0, 8) + '.' + format; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
      status.textContent = bundle ? 'Paquete de control generado con '+selected.rows.length+' filas del filtro. Incluye Excel, PDF, conciliación completa y manifiesto. SHA-256: '+bundle.sha256+'. No es una remesa de pago.' : (format === 'pdf' ? 'PDF' : 'Excel de control') + ' generado con ' + selected.rows.length + ' filas del filtro y sus observaciones.';
    } catch (error) { if (valid(job)) failure(error, error.code !== 'SOURCE_CHANGED'); } finally { if (job.seq === generation) { busy = false; controls(); } }
  }));
  function hidden() { if (available()) return; cancel(); clearResult(); controls(); status.textContent = 'Generá nuevamente la planilla para continuar.'; }
  document.addEventListener('taskchange', () => { if (available() && !catalog && !busy) consultCatalog(); else hidden(); });
  document.addEventListener('visibilitychange', hidden);
  document.addEventListener('municontrol:capabilities-ready', () => { if (!catalog && !data && !busy) return; cancel(); clearResult(); catalog = null; $('[data-pbg-dataset]').replaceChildren(new Option('Actualizá las liquidaciones disponibles', '')); controls(); status.textContent = 'El acceso se actualizó. Consultá nuevamente las liquidaciones.'; });
  window.addEventListener('pagehide', () => { suspended = true; hidden(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { suspended = false; cancel(); clearResult(); catalog = null; controls(); } });
  controls(); return { consultCatalog, consultReport };
}
